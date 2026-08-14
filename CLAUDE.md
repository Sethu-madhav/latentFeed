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
- **LLM enrichment** (`gpt-5-mini`) on its own `ENRICH_CRON`, upgrading rows
  from `enriched_by='heuristic'` to `'llm'` with a better summary, category,
  tags and a claim-status judgment.

Both degrade to the Section 1 behaviour on any failure. A fatal auth or
billing error stops the batch on the first article and latches for the process
rather than repeating for every row — check `/healthz` for `halted`.

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

**Duplicates are kept, not dropped.** A story another outlet already filed goes
into `article_duplicates` and bumps the original's `corroboration_count`, which
re-runs the scorer. That is how a rumour earns its way toward confirmed.

**Filter state lives entirely in the URL** (`?q=&cat=&org=&tag=&src=&cred=&sort=&page=`).
The rail is plain anchors built by `buildQuery` in `lib/filters.ts`, so it works
without JS and every view is shareable. Don't move it to client state.

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

Sections 1 (foundation, ingest, feed UI), 2 (source control) and 3 (OpenAI
enrichment, embeddings, semantic dedup) are done. Next: **4** story clustering
· **5** Model Radar (leak → launch lifecycle) · **6** release and benchmark
tracker.
