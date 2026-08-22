# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What This Is

latentFeed — an AI news intelligence feed. It polls ~49 sources every 30
minutes for model launches and leaks, feature and tool launches, research
papers, provider deals and compute buildouts, then scores every article 1–5 for
credibility so confirmed reporting and rumour can share one feed without being
confused for each other.

Tracked companies: OpenAI, Anthropic, xAI, Google/DeepMind, Meta, Thinking
Machines, SSI, Nvidia, DeepSeek, Moonshot (Kimi), Z.AI (GLM), Alibaba (Qwen),
plus secondary players (Mistral, Microsoft, AWS, Apple, Hugging Face, Cursor,
Perplexity) for entity matching.

Design follows Anthropic's own surfaces: warm paper (`#faf9f5`), near-black ink,
the clay accent (`#d97757`) used sparingly, serif headlines.

Single Next.js 15 app — **not** a monorepo. The poller is a plain `worker/`
directory in the same repo sharing `lib/` through the `@/` alias.

## Commands

```bash
npm run dev              # web (:3000) + worker (:8788) together
npm run dev:web          # web only
npm run db:generate      # drizzle-kit generate after a schema change
npm run db:migrate       # apply migrations
npm run db:seed          # upsert orgs + source registry (idempotent)
npm run ingest:once      # one cycle now; append slugs to limit: npm run ingest:once openai-news
npm run enrich:once      # one LLM batch; `all` drains the backlog
npm run embed:backfill   # embed rows with no vector; `all` drains
npm run cluster:once     # regroup the last 7 days into stories
npm run rescore          # re-run the credibility scorer over every article
npm run radar:once       # rebuild the model radar (leak → launch)
npm run digest:once      # write today's brief; pass YYYY-MM-DD for a past day
# /releases needs no job — it reads the ingested GitHub release articles
npm run embed:backfill force   # re-embed everything (after enrichment rewrites summaries)
npm run test             # vitest
npm run typecheck        # tsc --noEmit
```

First-time setup needs Postgres 17 with pgvector:

```bash
createdb latent_feed && psql -d latent_feed -c 'CREATE EXTENSION IF NOT EXISTS vector;'
cp .env.example .env && npm run db:migrate && npm run db:seed && npm run ingest:once
```

## Architecture

**Data flow:** worker (node-cron, `POLL_CRON`) → `fetchSource` dispatches on
`source.kind` → canonicalize URL → dedup against the last 72h → heuristic
enrich (category, orgs, tags, credibility, impact) → Postgres. The web app
reads Postgres directly in server components via `lib/data.ts`.

**No API key is needed to run anything.** The heuristic layer — keyword rules,
an org alias dictionary, a domain tier table — is deterministic and always
runs. With `OPENAI_API_KEY` set, two optional layers switch on:

- **Embeddings** (`text-embedding-3-small`, 1536 dims) during ingest, enabling
  semantic dedup. Without them dedup falls back to title-token overlap.
- **LLM enrichment** (`gpt-5.4-mini`) on its own `ENRICH_CRON`, upgrading rows
  from `enriched_by='heuristic'` to `'llm'` with a better summary, category,
  tags and a claim-status judgment.

Both degrade to the Section 1 behaviour on any failure. A fatal auth or
billing error stops the batch on the first article and latches for the process
rather than repeating for every row — check `/healthz` for `halted`.

**Embed last, after the URL checks — never before.** Embeddings are the only
part of the pipeline that costs real money (the free tier covers chat models
only), and feeds re-serve their whole window on every poll: the Google News
queries can't use conditional GET at all, so a 100-item feed returns the same
~98 items 48 times a day. Embedding before the dedup checks meant paying to
re-encode articles already stored — ~99% of all embedding spend, about $4.50 a
month against $0.03 of useful work. `filterAlreadySeen` in `worker/ingest.ts`
now runs both exact-URL checks as two batched indexed queries for the whole
poll, and only survivors reach `embedItems`. Measured in production: 470 items
seen, 453 skipped, 17 embedded. `storeItem` still repeats both checks — the
pre-filter is an optimisation, not the dedup itself, and the duplication closes
the race between filtering and inserting. Anything that reorders this pipeline
must keep the paid step last.

**The LLM never overrides credibility opaquely.** It returns a claim status
(`confirmed` / `reported` / `unconfirmed`) which the scorer applies as a
recorded rule: `llm-unconfirmed` docks a point for hedging the keywords missed,
`llm-confirmed` restores one when the keyword rule fired on a false positive.
The tooltip still explains every point.

**arXiv is excluded from the LLM pass** (`SKIP_KINDS` in `worker/enrich.ts`) —
several hundred rows a day whose abstracts are already clean and correctly
categorised by the `isPaper` hint. They still get embeddings.

**Credibility (`lib/enrich/credibility.ts`) is the core of the app.** Base score
comes from the source, or — for aggregator feeds — from the *real publisher
domain*. Then: −1 hedging language, +1 first-party domain, +1 corroborated by
≥2 independent sources, −1 no byline and no date, clamped to 1–5. Every rule
that fires is stored in `credibility_reason` jsonb and surfaced in the meter's
hover text. **Never add a scoring rule without recording its reason** — an
opaque score is worse than none here.

**Scores are computed at write time, so rule changes need `npm run rescore`.**
It reproduces the LLM's contribution from the `llm-unconfirmed` /
`llm-confirmed` rules already stored in `credibility_reason`, so re-scoring
costs nothing and never re-runs the model. Expanding the publisher table moved
119 scores this way.

**`PUBLISHER_TIERS` must cover the long tail, not just the famous outlets.**
Aggregator queries surface publishers a hand-picked list never anticipates;
before expansion 46% of articles hit `publisher-unknown` and flat-defaulted to
3/5. `tierForDomain` also treats any tracked company's own domain as 5 — those
were falling through to the unknown default, so a lab's own announcement
reached us via an aggregator scored 4 instead of 5.

**Duplicates are kept, not dropped.** A story another outlet already filed goes
into `article_duplicates` and re-runs the scorer. That is how a rumour earns
its way toward confirmed.

**An outlet is a publisher, not a feed.** A Google News query is one `sources`
row but delivers many publishers. Keying corroboration on `source_id` counted a
syndicated story carried by 11 different local stations as a *single* outlet,
and dedup discarded ten of them as "same source" — badly understating
corroboration, and therefore credibility, for everything arriving via
aggregators. Identity is `publisher_domain ?? source_id`; see `sameOutlet` in
`worker/ingest.ts` and `countDistinctOutlets` in `worker/cluster.ts`. Fixing
this moved one story from 1 source to 10 and re-scored 123 articles.

**`corroboration_count` is derived, never incremented.** It is recomputed as
`max(distinct outlets in article_duplicates, story.source_count − 1)`. An
incrementing counter drifted upward every time a feed re-served an item
already matched — one article reached 11 against 2 real outlets — and since
corroboration feeds the `+1 corroborated` rule, that silently inflated
credibility. Anything touching it must recompute, not add.

**Clustering (`worker/cluster.ts`) groups one event across outlets.** It is a
full recompute over a 7-day window each run, not incremental: a late article
can merge two groups that previously looked separate. Single-link grouping
lets a story chain across rewordings. Only clusters of ≥2 articles become
`stories`; a lone article is just an article.

**Cluster thresholds are looser than dedup's, and deliberately conservative.**
Dedup drops an article on a match so it must be strict; clustering only
groups. But because cluster size raises corroboration and therefore
credibility, a false merge inflates trust — at a 0.30 title threshold
unrelated stories about the same company merged into one 10-article cluster.
0.42 is the validated floor for the title fallback; embeddings use 0.82 cosine
and catch synonym rewrites ("buy" vs "acquire") that headline overlap cannot.

**Filter state lives entirely in the URL** (`?q=&cat=&org=&tag=&src=&cred=&sort=&page=`).
The rail is plain anchors built by `buildQuery` in `lib/filters.ts`, so it works
without JS and every view is shareable. Don't move it to client state.

Facets toggle: clicking an active tag, org, category or source removes it.
**`buildQuery` must never return an empty string** — an empty `href` resolves
to the *current* URL, so toggling off the last remaining filter silently
re-requested the filtered page and looked like a dead click. It returns
`FEED_PATH` instead. Active facets are styled on cards as well as in the rail,
so it's visible that a second click will clear them.

## Model Radar (`/radar`)

`lib/enrich/models.ts` extracts model releases from titles; `worker/radar.ts`
aggregates them into the `models` table each cluster tick. Both are a full
recompute, for the same reason clustering is.

**Status is evidence-based and asymmetric.** `released` requires first-party
proof — weights on the lab's own Hugging Face account, or an article on the
lab's own domain. No volume of coverage promotes a rumour to shipped, which is
why Grok 4.6 sits at `confirmed` with 20 outlets: xAI publishes no feed we can
treat as first-party.

**Normalisation is the whole game.** One release appears as `Qwen3.8-27B`,
`Qwen 3.8 27b`, `Qwen/Qwen3.8-27B` and `unsloth/Qwen3.8-27B-GGUF`. Size
suffixes (27B, 2.4T) and dated builds (-0813) are dropped because they identify
a *build*; named tiers (Flash, Pro, Opus) are kept because they identify a
*model*. Both word orders normalise to one slug: "Claude Opus 4.8" and
"Gemini 3.7 Flash" put the tier on opposite sides of the version.

Three guards earn their keep, each added after a real false positive:

- **Tool releases.** `claude-code v2.1.232` from the GitHub feed produced a
  phantom "Claude Code V2.1" model with ten mentions. See `NOT_MODELS`.
- **Parameter counts.** "Qwen 30b MoE" produced "Qwen 30". The version may not
  be followed by `b`.
- **Regex backtracking.** Rejecting `30b` made the engine retry with `3`,
  producing "Qwen 3". The version must swallow all its digits — hence the
  `(?!\d)` before the size guard. Removing it silently resurrects the bug.

## Releases (`/releases`)

Shipping activity for the tracked harnesses and inference engines, derived
from the `github_releases` articles at query time. **No table backs this** —
a release is fully described by its URL, so there is nothing to store that
ingestion hasn't captured; `lib/releases.ts` parses it.

**Nothing here may assume semver.** The tracked repos use four conventions:
`v2.1.232` (claude-code), `rust-v0.148.0-alpha.17` (codex — component prefix),
`b10434` (llama.cpp build counters, many per day) and `v0.27.2rc0` (vllm,
no separator before the rc marker). Prereleases are detected from the channel
word, and a bare letter-plus-digits tag is treated as a build rather than a
version — otherwise `b10434` reads as a beta.

**Benchmarks were deliberately dropped from this section.** Only 3 of ~1,000
articles named a benchmark and 2 carried a score: the numbers live in model
cards, papers and leaderboards, not news headlines, and the arXiv feeds that
carried them were removed for volume. Building extraction for two data points
would have been waste. If it is revisited, add leaderboard or model-card
sources *first* and confirm the data exists.

## Reader state and the brief

**Multi-reader.** `article_reads`, `saved_articles` and `reader_state` are all
keyed by `user_id` and cascade from `users`. Every query touching them resolves
the reader itself through `requireUserId()` in `lib/data.ts`, rather than
taking a user id from its caller — a caller that forgets to pass one would
silently read across all readers, and that failure looks like corrupt data
rather than a missing argument.

**The user filter belongs in the JOIN, not the WHERE.** `readsFor` /
`savedFor` in `lib/data.ts` exist for this. A left join whose `user_id = …`
test sits in the WHERE clause drops every article the reader has *not* marked,
turning the feed into "only things I've already read" — which reads as an
empty database, not as a bug.

**Marking read must never block the click.** `ReadLink` fires the action
without awaiting it — the browser is already opening the publisher. Losing a
read mark is recoverable; a click that stalls is not.

**The digest picks one article per story** before it calls the model. A launch
covered by 21 outlets would otherwise fill the whole brief with one event.
Citations coming back from the model are validated against the candidate set,
so a brief can never link an article that wasn't in scope.

**With no key the digest still writes**, falling back to the top items by
impact — same degradation contract as enrichment and embeddings.

## Auth and roles

Auth.js v5 (`lib/auth/`), sessions as JWTs, two ways in: Google, and
email/password. Sign-up is open.

**The config is split because middleware runs on the edge.** `lib/auth/config.ts`
holds only what the edge can load; `lib/auth/index.ts` adds the Drizzle adapter
and the credentials provider, both of which pull in postgres.js and bcrypt.
`middleware.ts` builds its own `NextAuth(authConfig)` from the edge half. Import
`@/lib/auth` there and the build fails naming a transitive dependency rather
than the real cause.

**Sessions are JWTs because credentials and database sessions are mutually
exclusive in Auth.js.** The `sessions` table exists only to satisfy the
adapter's types.

**Roles are checked two different ways, on purpose.** `isAdmin()` reads the
session token — cheap, used for rendering. `isAdminNow()` reads the database —
used by `/sources` and by every mutation in `app/sources/actions.ts`. The token
is stamped at sign-in and lives 90 days, so a revoked admin would otherwise
keep source management, *including the cascading delete*, until it expired.
Anything gating a capability must use `isAdminNow()`.

**The first account is only auto-promoted when `ADMIN_EMAILS` is empty.**
Sign-up is open, so if the list names an owner who hasn't signed in yet,
promoting the first arrival would hand source management to whichever stranger
found the URL first. The bootstrap exists so a fresh deploy with no config is
never left with nobody able to manage sources.

**`/sources` is admin-only and redirects everyone else**; the nav link is
rendered by `SourcesLink`, which returns null for readers. The server actions
repeat the check independently — a server action is a public HTTP endpoint, so
hiding a button is presentation, not protection.

**Google uses `allowDangerousEmailAccountLinking`.** The guard it disables
protects against providers that don't verify email addresses; Google does. Left
on, signing up with a password and later clicking the Google button dead-ends
at `OAuthAccountNotLinked`. The reverse — signing *up* by password onto an
address that already exists as a Google account — is refused, since setting a
password there would hand the account to anyone who knows the address.

**Google is optional.** With `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` unset the
provider is dropped and the button is hidden, so email/password still works —
same degradation contract as enrichment and embeddings. `AUTH_SECRET` is the
one hard requirement.

## Deployment shape

Web on Vercel, Postgres on Neon, and the poller as **GitHub Actions running the
existing CLIs** — serverless cannot host a long-lived worker, so production
schedules the same jobs rather than reimplementing them. `worker/index.ts` is
unchanged and still what `npm run dev` uses.

- **Use Neon's pooled connection string.** `db/client.ts` drops to `max: 1`
  under `VERCEL` because each serverless instance otherwise opens its own pool.
- **Scheduled workflows only run on the default branch.** This repo is on
  `master`; if the remote defaults to `main`, the cron silently never fires.

## Gotchas that cost time

- **rss-parser returns non-strings.** An element with attributes parses to
  `{_, $}`, an empty one to a *null-prototype object*. Passing that to the
  driver crashes the insert with "Cannot read properties of null (reading
  'constructor')" and kills the whole feed. Every parser-derived field must go
  through `asText()` in `lib/fetching/http.ts`.
- **rss-parser drops `<source url="...">`** on Google News items, and its
  xml2js options can't be overridden without breaking the parse. The attribute
  is recovered by regex in `publisherUrlsByLink`. Without it every Anthropic and
  xAI item would be scored as a generic aggregator rather than as WSJ or a
  content farm.
- **`array_to_string` is only STABLE**, so it cannot appear in an index
  expression. The FTS index covers title + summary only; tags are filtered via
  their own GIN index.
- **Don't interpolate a bare `Date` into a `sql` template** — it reaches
  postgres.js without the column's type mapper and throws `ERR_INVALID_ARG_TYPE`.
  Use drizzle's `gte`/`lte` helpers inside the fragment.
- **`count(*) filter (...)::int` doesn't parse.** Wrap the aggregate:
  `(count(*) filter (...))::int`.
- **GitHub org timeline atoms are empty now** (`github.com/<org>.atom` returns
  zero entries). Model drops are tracked through the Hugging Face models API
  instead — which is a better signal anyway, since weights usually land before
  any announcement.
- **Reddit 429s** two subreddit feeds fetched 1.5s apart; it has a 6s per-host
  override in `HOST_THROTTLE_OVERRIDES`.
- **React resets an uncontrolled form after a `useActionState` submit.** Both
  source forms are fully controlled for this reason — with `defaultValue`,
  pressing "Test feed" wiped everything the user had typed, and a failed save
  discarded their edits.
- **Drizzle renders a column unqualified inside a raw `sql` fragment**, so
  `sources.id` in a correlated subquery becomes `"id"` and Postgres resolves it
  against the *inner* table. `getSourcesWithHealth` fetches its aggregates
  separately and merges them in JS instead.
- **Vectors from different embedding models are not comparable.** Every
  similarity query must filter on `embedding_model`, or it will return
  confident nonsense. After changing `OPENAI_EMBEDDING_MODEL`, old rows are
  invisible to dedup until `npm run embed:backfill all` re-embeds them.
- **The gpt-5 family rejects `temperature`**, so `structuredCompletion` doesn't
  send it. Structured output uses `response_format: json_schema` with
  `strict: true`.
- **OpenAI's free shared-traffic tier covers chat models only.** The mini/nano
  models get the large daily allowance and `gpt-5.4-mini` is the default for
  that reason, but *no embedding model is included* — embeddings always draw on
  real credit. Being "eligible" for the free tier is not the same as being
  enrolled: until data sharing is enabled for the specific **project** the
  `sk-proj-…` key belongs to, every call returns `429 insufficient_quota /
  credit_balance_exhausted`, even for a listed model.
- **Don't run `npm run build` while `next dev` is running.** The build rewrites
  `.next`, invalidating the running dev server's chunk hashes; the page then
  404s on `_next/static/chunks/*` and throws bogus `ReferenceError`s for
  symbols that are plainly imported. Stop the dev server, `rm -rf .next`,
  restart. Several "impossible" errors here were only ever this.

## Leaks and rumour

The scarcest category, and the one the app is nominally for. Before the leak
feeds existed the corpus held **14 articles containing leak vocabulary at all,
out of ~2,000** — and the classifier was not at fault. `model-leak` rules in
`lib/enrich/classify.ts` fire correctly; the material simply never arrived.
Diagnose a coverage gap here by counting the vocabulary in `articles` before
touching the classifier.

**Reported leaks, not leakers.** The people worth following publish on X, which
serves no RSS and refuses anonymous reads; the Nitter bridges that used to
stand in are gone. A feed wired through one would look healthy and quietly
return nothing — the failure mode `probeFeed` exists to catch. So the leak
feeds track the *reporting* a leak produces, which arrives one hop later and
carries a publisher domain the scorer can actually rate.

**Every query here was measured before being added.** Eight shapes were probed
for on-target ratio; two survived. Bare `leak` was dropped because it matches
data breaches far more than model leaks (10% on-target); attribution language
— `"sources say"`, `"people familiar"` — turned out to carry the real scoops
and reached 25%.

**`gnews-unreleased-models` goes stale by construction.** A model name that has
shipped stops being a rumour and starts pulling ordinary launch coverage. The
first draft named Kimi K3, already shipped, and 9 of its 11 results were K3
reviews. The `models` table is the check — anything at `released` or
`confirmed` belongs one version further on:

```sql
select name, status from models where status in ('released','confirmed');
```

That query also caught `"Grok 6"` skipping a generation past a Grok 4.6 radar.

**Watch for homonyms in version-number queries.** `"Gemini 4"` is also a 1965
NASA mission, and Britannica's spacewalk write-up scored a clean 3/5 on its way
in. `test/leak-sources.test.ts` pins the exclusion.

## Source control (`/sources`)

Two independent off-switches, and conflating them is the easiest mistake here:

- **Hide** (`muted_at`) — keeps polling, drops the source out of the feed and
  out of the header counts. Its articles still exist and still count toward
  corroboration.
- **Stop** (`enabled = false`) — halts polling entirely. Re-enabling also
  clears `consecutive_failures`, because the usual reason a source is off is
  that it auto-disabled at 5 failures and leaving the count would trip it again
  on the next hiccup.

**Delete cascades to articles.** `articles.source_id` is `on delete cascade`,
so removing a source destroys everything it contributed; the confirm step shows
the count and points at Stop instead. Adding the feed back does not recover
items that have since fallen out of it.

**Deleting a stock source writes a tombstone to `retired_sources`, and
`db:seed` skips those slugs.** Without it the registry resurrects the feed on
the next seed along with everything it ingests — `meta.managedBy='user'`
protects *edits*, not *deletions*. Never "restore" a missing stock source by
re-seeding without checking `retired_sources` first: its absence is probably
deliberate. The `/sources` page lists removed feeds with a Restore control,
which clears the tombstone and re-inserts from the registry.

Adding a feed **probes it first** (`lib/sources/validate.ts`) and refuses
anything that parses to zero items — a source that silently contributes nothing
while looking healthy is the quiet failure mode this app is most prone to.
Parser errors are translated by `humanizeProbeError`; don't surface raw xml2js
messages in the UI.

Server actions live in `app/sources/actions.ts` and revalidate both `/sources`
and `/`.

## Conventions

- Sources live in `lib/sources/registry.ts`; edit there, then `npm run db:seed`.
  Rows edited in the UI get `meta.managedBy='user'` and survive re-seeds.
- A source auto-disables after 5 consecutive failures with the reason recorded.
  Feeds rot; that is expected, not a bug.
- Classification and tagging see only the title plus the first 400 characters
  of the body. Full bodies (GitHub release notes especially) trip enough
  incidental keywords to produce nonsense tags.
- New heuristics need a test in `test/`. The scorer and classifier are the
  parts most likely to regress silently.

## Roadmap

Sections 1 (foundation, ingest, feed UI), 2 (source control), 3 (OpenAI
enrichment, embeddings, semantic dedup) and 4 (story clustering) are done.
All six sections are done. Benchmarks were dropped from Section 6 for lack
of data (see Releases above); everything else shipped.

**Feed layout:** a responsive card grid (1 / 2 / 3 / 4 columns). Two things
about it are load-bearing:

- **Cards have no thumbnail**, because there is no image to show. The short
  accent strip at the top of each card stands in for one, tinted with the lead
  company's colour so the grid can be scanned by company. Keep it short — it
  carries no information, so a tall band is just decoration pushing the
  headline down.
- **Use named Tailwind breakpoints for the column counts.** An arbitrary
  `min-[1800px]:` variant sorts *before* the named ones in the generated CSS,
  so `xl:grid-cols-3` won at wide widths and the fourth column never appeared.

Cards are equal height within a row (`mt-auto` on the footer) so credibility
meters line up and can be compared across a row at a glance.
