import { ArrowLeft, ExternalLink, Layers } from "lucide-react";
import { notFound } from "next/navigation";
import {
  CredibilityMeter,
  credibilityLabel,
} from "@/components/credibility-meter";
import { ThemeToggle } from "@/components/theme-toggle";
import { CATEGORY_META } from "@/lib/enrich/classify";
import { getStory } from "@/lib/data";
import { ORG_BY_SLUG } from "@/lib/orgs";
import { displayHost, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) notFound();

  const category = CATEGORY_META[story.category];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
          <a href="/" className="font-display text-[17px] tracking-tight text-ink">
            latent<span className="text-clay">Feed</span>
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to feed
          </a>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <article className="max-w-[52rem] px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="font-mono text-[10px] font-medium tracking-[0.08em]"
            style={{ color: category.accent }}
          >
            {category.short}
          </span>
          {story.orgSlugs.slice(0, 4).map((slug) => {
            const org = ORG_BY_SLUG.get(slug);
            if (!org) return null;
            return (
              <a
                key={slug}
                href={`/?org=${slug}`}
                className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: org.accent }}
                />
                {org.name}
              </a>
            );
          })}
        </div>

        <h1 className="mt-2 font-display text-[24px] leading-tight text-ink">
          {story.headline}
        </h1>

        {story.summary && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            {story.summary}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule py-2.5 font-mono text-[11px] text-ink-faint">
          <span className="inline-flex items-center gap-1.5 text-ink-muted">
            <Layers className="h-3.5 w-3.5" />
            {story.sourceCount} independent{" "}
            {story.sourceCount === 1 ? "outlet" : "outlets"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CredibilityMeter score={story.topCredibility} />
            {credibilityLabel(story.topCredibility)} at best
          </span>
          <span suppressHydrationWarning>
            first seen {relativeTime(story.firstSeenAt)} ago
          </span>
          <span
            title={
              story.clusteredBy === "embedding"
                ? "Grouped by semantic similarity"
                : "Grouped by headline overlap — embeddings were unavailable"
            }
          >
            grouped by {story.clusteredBy}
          </span>
        </div>

        <h2 className="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          Coverage
        </h2>

        <ol className="mt-2">
          {story.articles.map((article) => (
            <li
              key={article.id}
              className="border-b border-rule py-3 last:border-b-0"
            >
              <div className="flex items-baseline gap-3">
                <time
                  dateTime={article.publishedAt.toISOString()}
                  title={article.publishedAt.toLocaleString()}
                  className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint"
                  suppressHydrationWarning
                >
                  {relativeTime(article.publishedAt)}
                </time>

                <div className="min-w-0 flex-1">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-[14.5px] leading-snug text-ink decoration-clay/50 underline-offset-[3px] hover:underline"
                  >
                    {article.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                    <span className="text-ink-muted">{article.sourceName}</span>
                    <span className="font-mono text-[10px]">
                      {article.publisherDomain ?? displayHost(article.url)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CredibilityMeter
                        score={article.credibility}
                        reasons={article.credibilityReason}
                        enrichedBy={article.enrichedBy}
                      />
                      {credibilityLabel(article.credibility)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {story.alsoCarriedBy.length > 0 && (
          <>
            <h2 className="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
              Also carried by
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
              Folded in during ingestion as the same story, so they don&apos;t
              appear separately in the feed.
            </p>
            <ul className="mt-2 space-y-1.5">
              {story.alsoCarriedBy.map((dupe) => (
                <li key={dupe.url} className="text-[12.5px]">
                  <a
                    href={dupe.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-baseline gap-1.5 text-ink-muted transition-colors hover:text-ink"
                  >
                    <span className="text-ink-faint">{dupe.sourceName}</span>
                    <span className="min-w-0">{dupe.title ?? dupe.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-ink-faint" />
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </div>
  );
}
