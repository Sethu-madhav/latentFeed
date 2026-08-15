import { Radar } from "lucide-react";
import { CredibilityMeter } from "@/components/credibility-meter";
import { ThemeToggle } from "@/components/theme-toggle";
import { getRadar, type RadarModel } from "@/lib/data";
import { STATUS_META, STATUS_ORDER, type ModelStatus } from "@/lib/enrich/models";
import { ORG_BY_SLUG } from "@/lib/orgs";
import { cn, relativeTime } from "@/lib/utils";
import { SourcesLink } from "@/components/sources-link";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const radar = await getRadar();

  // Most certain first: what shipped matters more than what might.
  const columns = [...STATUS_ORDER].reverse();
  const byStatus = new Map<ModelStatus, RadarModel[]>(
    columns.map((s) => [s, radar.filter((m) => m.status === s)]),
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
          <a href="/" className="font-display text-[17px] tracking-tight text-ink">
            latent<span className="text-clay">Feed</span>
          </a>
          <nav className="flex items-center gap-1 text-[12.5px]">
            <a
              href="/"
              className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              Feed
            </a>
            <span className="rounded-md bg-paper-sunken px-2 py-1 font-medium text-ink">
              Radar
            </span>
            <a
              href="/releases"
              className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              Releases
            </a>
            <SourcesLink className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink" />
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <div className="px-4 py-5 sm:px-6">
        <h1 className="flex items-center gap-2 font-display text-[19px] text-ink">
          <Radar className="h-4 w-4 text-clay" />
          Model Radar
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
          Every model release named in the last 45 days, placed on the arc from
          rumour to shipped. Status is evidence-based:{" "}
          <strong>Released</strong> requires weights or an announcement from the
          lab itself, so no amount of coverage can promote a rumour to shipped.
        </p>

        {radar.length === 0 ? (
          <p className="mt-6 text-[13px] text-ink-muted">
            No models tracked yet — run{" "}
            <code className="font-mono text-[12px]">npm run radar:once</code>.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {columns.map((status) => {
              const meta = STATUS_META[status];
              const items = byStatus.get(status) ?? [];
              return (
                <section key={status} className="min-w-0">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.accent }}
                    />
                    <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink">
                      {meta.label}
                    </h2>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {items.length}
                    </span>
                  </div>
                  <p className="mb-2.5 text-[11px] leading-relaxed text-ink-faint">
                    {meta.blurb}
                  </p>

                  <div className="flex flex-col gap-2">
                    {items.map((model) => (
                      <ModelCard key={model.slug} model={model} />
                    ))}
                    {items.length === 0 && (
                      <p className="rounded-md border border-dashed border-rule px-3 py-4 text-center text-[11px] text-ink-faint">
                        nothing here
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelCard({ model }: { model: RadarModel }) {
  const org = model.orgSlug ? ORG_BY_SLUG.get(model.orgSlug) : undefined;
  const accent = org?.accent ?? STATUS_META[model.status].accent;

  return (
    <a
      href={`/radar/${model.slug}`}
      className={cn(
        "block overflow-hidden rounded-lg border border-rule bg-paper-raised transition-all",
        "hover:-translate-y-px hover:border-rule-strong hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
      )}
    >
      <span
        aria-hidden
        className="block h-[3px] w-full"
        style={{ backgroundColor: accent }}
      />
      <div className="px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-display text-[14px] text-ink">
            {model.name}
          </span>
          <span
            className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint"
            suppressHydrationWarning
          >
            {relativeTime(model.lastSeenAt)}
          </span>
        </div>

        {org && (
          <span className="mt-0.5 block text-[11px] text-ink-muted">
            {org.name}
          </span>
        )}

        <div className="mt-2 flex items-center gap-2">
          <CredibilityMeter score={model.topCredibility} />
          <span className="font-mono text-[10px] tabular-nums text-ink-faint">
            {model.mentionCount} mention{model.mentionCount === 1 ? "" : "s"} ·{" "}
            {model.sourceCount} outlet{model.sourceCount === 1 ? "" : "s"}
          </span>
        </div>

        {model.lead && (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-muted">
            {model.lead.title}
          </p>
        )}
      </div>
    </a>
  );
}
