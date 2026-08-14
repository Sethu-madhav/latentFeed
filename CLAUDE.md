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

**No API key is needed to run anything.** All enrichment in Section 1 is
deterministic: keyword rules, an org alias dictionary, and a domain tier table.
Rows record `enriched_by='heuristic'` so Section 3's LLM pass can backfill them.

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

Section 1 (foundation, ingest, feed UI) is done. Next: **2** `/sources` CRUD
and per-source health · **3** Claude enrichment + embeddings and semantic dedup
· **4** story clustering · **5** Model Radar (leak → launch lifecycle) · **6**
release and benchmark tracker.
