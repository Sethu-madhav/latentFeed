import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import {
  CredibilityMeter,
  credibilityLabel,
} from "@/components/credibility-meter";
import { ThemeToggle } from "@/components/theme-toggle";
import { getModelTimeline, getRadar } from "@/lib/data";
import { CATEGORY_META } from "@/lib/enrich/classify";
import { STATUS_META } from "@/lib/enrich/models";
import { ORG_BY_SLUG } from "@/lib/orgs";
import { displayHost, relativeTime, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ModelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [radar, timeline] = await Promise.all([
    getRadar(),
    getModelTimeline(slug),
  ]);
  const model = radar.find((m) => m.slug === slug);
  if (!model) notFound();

  const org = model.orgSlug ? ORG_BY_SLUG.get(model.orgSlug) : undefined;
  const status = STATUS_META[model.status];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
          <a href="/" className="font-display text-[17px] tracking-tight text-ink">
            latent<span className="text-clay">Feed</span>
          </a>
          <a
            href="/radar"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Radar
          </a>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <article className="max-w-[52rem] px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ backgroundColor: `${status.accent}22`, color: status.accent }}
          >
            {status.label}
          </span>
          {org && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: org.accent }}
              />
              {org.name}
            </span>
          )}
        </div>

        <h1 className="mt-2 font-display text-[26px] leading-tight text-ink">
          {model.name}
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">{status.blurb}.</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-rule py-3 sm:grid-cols-4">
          <Stat label="First seen">
            <span suppressHydrationWarning>
              {timeAgo(model.firstSeenAt)}
            </span>
          </Stat>
          <Stat label={model.releasedAt ? "Released" : "Last mention"}>
            <span suppressHydrationWarning>
              {timeAgo(model.releasedAt ?? model.lastSeenAt)}
            </span>
          </Stat>
          <Stat label="Coverage">
            {model.mentionCount} article{model.mentionCount === 1 ? "" : "s"} ·{" "}
            {model.sourceCount} outlet{model.sourceCount === 1 ? "" : "s"}
          </Stat>
          <Stat label="Best sourcing">
            <span className="inline-flex items-center gap-1.5">
              <CredibilityMeter score={model.topCredibility} />
              {credibilityLabel(model.topCredibility)}
            </span>
          </Stat>
        </dl>

        <h2 className="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          How the story developed
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
          Oldest first, so the arc from first sighting to confirmation reads
          top to bottom.
        </p>

        <ol className="mt-3">
          {timeline.map((article) => {
            const category = CATEGORY_META[article.category];
            return (
              <li
                key={article.id}
                className="relative border-l border-rule py-2.5 pl-5"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-4 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                  style={{ backgroundColor: category.accent }}
                />

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className="font-mono text-[10px] font-medium tracking-[0.08em]"
                    style={{ color: category.accent }}
                  >
                    {category.short}
                  </span>
                  <time
                    dateTime={article.publishedAt.toISOString()}
                    className="font-mono text-[10px] tabular-nums text-ink-faint"
                    suppressHydrationWarning
                  >
                    {timeAgo(article.publishedAt)}
                  </time>
                  {article.isRumour && (
                    <span className="rounded-sm bg-clay/15 px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.1em] text-clay-deep">
                      UNVERIFIED
                    </span>
                  )}
                </div>

                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block font-display text-[14.5px] leading-snug text-ink decoration-clay/50 underline-offset-[3px] hover:underline"
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
              </li>
            );
          })}
        </ol>
      </article>
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </dt>
      <dd className="mt-0.5 text-[12.5px] text-ink">{children}</dd>
    </div>
  );
}
