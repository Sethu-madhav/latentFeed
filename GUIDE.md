# latentFeed — developer guide

An AI news feed that pulls model launches, leaks, papers, deals and tooling
every 30 minutes and scores each item 1–5 for credibility.

## Setup

Requires Node ≥ 20.9 and Postgres 17 with the `vector` extension available.

```bash
createdb latent_feed
psql -d latent_feed -c 'CREATE EXTENSION IF NOT EXISTS vector;'
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run ingest:once      # first batch — takes ~1 minute
npm run dev              # web on :3000, worker on :8788
```

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string. Required. |
| `INGEST_USER_AGENT` | `latentFeed/0.1` | Sent on every feed request. Publishers block blank or generic agents. |
| `POLL_CRON` | `*/30 * * * *` | Worker schedule. |
| `WORKER_PORT` | `8788` | Health endpoint (`/healthz`). |
| `DISABLE_INGEST` | unset | Set to `1` to stop polling; the web app still serves. |
| `ANTHROPIC_API_KEY` | unset | Reserved for Section 3. Unused today. |

## How it works

```
worker/index.ts   node-cron every 30 min, health server, overlap guard
  └─ worker/ingest.ts
       ├─ lib/fetching/       fetch + normalise per source kind
       ├─ lib/enrich/dedup    canonical URL, then title similarity over 72h
       ├─ lib/enrich/         category, orgs, tags, credibility, impact
       └─ Postgres

app/page.tsx      server component → lib/data.ts → Postgres
```

### Source kinds

| Kind | Fetcher | Used for |
|---|---|---|
| `rss` | `rss.ts` | Lab blogs, press, analysts |
| `google_news` | `google-news.ts` | Labs with no feed (Anthropic, xAI, SSI, Thinking Machines) |
| `hf_models` | `hf-models.ts` | Weight drops — the launch signal for DeepSeek, Moonshot, Z.AI, Qwen |
| `hf_papers` | `hf-papers.ts` | Curated daily papers, with upvotes and keywords |
| `arxiv` | `arxiv.ts` | cs.CL / cs.LG / cs.AI |
| `github_releases` | `github-releases.ts` | Harness and framework releases |
| `hn` | `hn.ts` | Hacker News via Algolia, narrowed by `meta.queries` |
| `reddit` | `reddit.ts` | Subreddit Atom feeds |

### Credibility, 1–5

Base score comes from the source — or, for Google News items, from the real
publisher domain, which is why the `<source url>` attribute is recovered from
the raw XML. Then:

| Rule | Δ |
|---|---|
| Hedging language (reportedly, leaked, sources say, datamined…) | −1 |
| Published on a tracked company's own domain | +1 |
| Corroborated by ≥ 2 independent sources | +1 |
| No byline **and** no publish date | −1 |

Clamped to 1–5. Items at ≤ 2 are marked `is_rumour` and quarantined in the UI
with a clay rule and an `UNVERIFIED` tag. Every applied rule is stored in
`credibility_reason` and shown when you hover the meter.

**Impact** is scored separately (0–100) from category weight, how many tracked
labs are involved, corroboration, and community signal (HN points, HF upvotes).
Vendor case studies are damped by 25 so first-party marketing doesn't float to
the top of an impact sort. Credibility and impact are deliberately independent:
a routine version bump is highly credible and low impact; a plausible frontier
leak is the reverse.

## Using the feed

Everything is a URL parameter, so any view can be bookmarked or shared:

```
/?q=gemini&cat=model-launch,model-leak&org=google&cred=4&sort=impact
```

| Param | Meaning |
|---|---|
| `q` | Full-text search over title and summary |
| `cat` | Categories, comma-separated |
| `org` | Companies |
| `tag` | Topics |
| `src` | Source slugs |
| `cred` | Minimum credibility, 1–5 |
| `from` / `to` | ISO dates |
| `sort` | `newest` (default), `credibility`, `impact` |

## Managing sources

Edit `lib/sources/registry.ts`, then `npm run db:seed` — it upserts by slug and
never overwrites rows a user has edited in the UI (`meta.managedBy='user'`).

Check source health:

```bash
psql -d latent_feed -c "select s.slug, i.ok, i.items_seen, i.items_new, i.error
  from ingest_runs i join sources s on s.id = i.source_id
  order by i.ran_at desc limit 40;"
```

A source that fails 5 polls in a row disables itself and records why in
`disabled_reason`. Re-enable with:

```bash
psql -d latent_feed -c "update sources set enabled=true, consecutive_failures=0,
  disabled_reason=null where slug='the-information';"
```

Known-flaky feeds: The Information intermittently 403s, and Reddit 429s under
load despite the 6-second per-host throttle. Both recover on their own.

## Troubleshooting

**Feed page is empty** — run `npm run ingest:once`. Check `ingest_runs` for
errors.

**A source shows 0 items** — the endpoint probably moved. Verify with
`curl -sSL -A "latentFeed/0.1" <feedUrl> | head -c 400`.

**Everything lands in `other`** — the classifier only sees the title plus 400
characters of body. Add a pattern to `RULES` in `lib/enrich/classify.ts` and a
test in `test/classify.test.ts`.

**Worker health**: `curl localhost:8788/healthz` reports the last cycle,
whether one is running, and the active cron expression.

## Roadmap

1. ✅ Foundation, ingestion, feed UI
2. `/sources` CRUD, per-source health, custom feeds
3. Claude enrichment, embeddings, semantic dedup
4. Story clustering with corroboration-boosted credibility
5. Model Radar — leak → corroboration → launch lifecycle
6. Release and benchmark tracker
