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
| `OPENAI_API_KEY` | unset | Turns on embeddings and LLM enrichment. Everything works without it. |
| `OPENAI_ENRICHMENT_MODEL` | `gpt-5.4-mini` | Chat model for the enrichment pass. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Must be 1536-dim to match the column. |
| `ENRICH_CRON` | `*/10 * * * *` | Enrichment schedule. |
| `ENRICH_BATCH_SIZE` | `40` | Articles per enrichment cycle — the cost dial. |
| `DISABLE_LLM` / `DISABLE_EMBEDDINGS` | unset | Switch off either half. |

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

Most of this is now on **`/sources`**. Each row shows what the feed is
contributing (article count, new items in the last 7 days, when it was last
polled) and what broke if anything did.

| Control | Effect |
|---|---|
| 👁 Hide | Drops the source out of the feed but keeps ingesting it. Its articles still count toward corroboration. Use this for noisy sources. |
| ⏻ Stop | Halts polling entirely. Re-enabling also clears the failure counter. |
| ↺ Reset | Clears the failure count on a source that's been erroring. |
| ✏️ Edit | Name, feed URL, base credibility, poll interval, company. |
| 🗑 Remove | Deletes the source **and all its articles**. The confirm step shows how many. The removal is remembered, so `db:seed` won't bring it back. |

Removed stock feeds appear in a **Removed** section at the bottom of
`/sources` with a Restore button. That list is why `db:seed` reports
"skipped N you removed" — deleting a feed is a decision, and it outlives a
re-seed.

**Adding a feed** validates before saving: paste a URL, press *Test feed* to see
what it parses to, then *Add source*. The type is auto-detected from the URL.
A feed that returns zero items is rejected rather than saved broken.

Anything you add or edit here is marked `meta.managedBy='user'`, so
`npm run db:seed` will not overwrite it.

For bulk changes, edit `lib/sources/registry.ts` then `npm run db:seed` — it
upserts by slug, skips user-managed rows, and skips anything you've removed.

**Too many articles from one source?** Removing it deletes its history too.
To keep the history but quiet the feed, use Hide instead — or raise the poll
interval so it contributes less.

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
load despite the 6-second per-host throttle. Both recover on their own — the
Reset control on `/sources` clears their failure count if it has crept up.

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

## Enrichment and semantic dedup

Optional, and off until `OPENAI_API_KEY` is set.

```bash
npm run embed:backfill all   # embed existing rows (needed once)
npm run enrich:once all      # drain the LLM backlog
curl localhost:8788/healthz  # enrich + embeddings status, including `halted`
```

**Embeddings** run inside ingestion, batched once per source poll. New items
are compared against the last 72 hours by cosine distance; anything closer than
0.12 is the same story, so it becomes a corroboration record instead of a
second row. Without a key this falls back to title-token overlap.

**LLM enrichment** runs on its own schedule so a slow model never delays the
feed. It rewrites the summary, category and tags, and returns a claim status
that the credibility scorer applies as a recorded rule — `llm-unconfirmed`
docks a point for hedging the keyword list missed, `llm-confirmed` restores one
when the keyword rule was a false positive. Hover the meter to see which fired;
it also says whether the row was assessed by the model or by keywords alone.

arXiv is excluded from the LLM pass (hundreds of rows a day, already clean) but
still gets embeddings.

**Cost control:** `ENRICH_BATCH_SIZE` caps articles per cycle, `ENRICH_CRON`
sets how often, and `DISABLE_LLM=1` stops it entirely while leaving embeddings
on. Rows are processed newest-first, so if the backlog outruns the budget the
articles you're actually reading get upgraded first.

**Changing the embedding model** makes existing vectors incomparable — they're
filtered out of dedup by `embedding_model` rather than silently mismatched.
Re-run `npm run embed:backfill all` after any change.

### If every call returns `insufficient_quota`

OpenAI's free daily allowance applies to *traffic shared with OpenAI*, and only
to chat models — the mini/nano tier gets the larger allowance, which is why
`gpt-5.4-mini` is the default. Two things catch people out:

- **Eligible ≠ enrolled.** Data sharing has to be switched on, and for a
  `sk-proj-…` key it must be on for that key's **project**, not just the org.
  Until then even a listed model returns
  `429 insufficient_quota / credit_balance_exhausted`.
- **No embedding model is covered.** `text-embedding-3-small` always bills.
  It is very cheap — embedding a ~1,000-article backlog is roughly 200K tokens,
  well under a cent — but it needs a non-zero balance.

Nothing here is required: with no working key the app runs on heuristics,
title-similarity dedup and title-based clustering, exactly as it did before.

## Story clustering

```bash
npm run cluster:once   # regroup the last 7 days
```

The same event covered by several outlets becomes one **story**. Clustered
rows show a clay "N sources" link in the feed; `/story/[id]` lists every
outlet, in publication order, with each one's own credibility score — so you
can see a rumour appear at one outlet and firm up as others corroborate it.

Independent coverage raises credibility: a story's outlet count sets each
member's corroboration, which is worth +1 once two or more independent sources
carry it. That is the whole "rumour earns its way to confirmed" mechanic.

Grouping uses embeddings when available (0.82 cosine) and headline overlap
otherwise (0.42 Jaccard). The title fallback misses synonym rewrites — "buy"
versus "acquire" share no words — and the threshold is deliberately *not*
lowered to catch them, because at 0.30 unrelated stories about the same
company merge, and a false merge inflates credibility. The story page says
which method grouped it.

Clustering is a full recompute over the window, so it's safe to re-run or to
miss a cycle.

## Roadmap

1. ✅ Foundation, ingestion, feed UI
2. ✅ `/sources` CRUD, per-source health, custom feeds
3. ✅ OpenAI enrichment, embeddings, semantic dedup
4. ✅ Story clustering with corroboration-boosted credibility
5. Model Radar — leak → corroboration → launch lifecycle
6. Release and benchmark tracker
