import { AddSourceForm } from "@/components/sources/add-source-form";
import { SourceRow } from "@/components/sources/source-row";
import { RetiredSources } from "@/components/sources/retired-sources";
import { getRetiredSources, getSourcesWithHealth } from "@/lib/data";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/sources/labels";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAdminNow } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  /*
   * Admin-only, checked against the database rather than the session token so
   * that revoking someone takes effect on their next request instead of when
   * their 90-day JWT expires.
   *
   * Redirecting rather than rendering a refusal keeps the page's existence
   * quiet, and the server actions repeat this check independently — this
   * guards the view, not the writes.
   */
  if (!(await isAdminNow())) redirect("/");

  const [sources, retired] = await Promise.all([
    getSourcesWithHealth(),
    getRetiredSources(),
  ]);

  const enabled = sources.filter((s) => s.enabled).length;
  const failing = sources.filter((s) => s.consecutiveFailures > 0).length;
  const muted = sources.filter((s) => s.mutedAt !== null).length;
  const contributing = sources.filter((s) => s.articleCount > 0).length;

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: sources.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);

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
            <a
              href="/radar"
              className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              Radar
            </a>
            <span className="rounded-md bg-paper-sunken px-2 py-1 font-medium text-ink">
              Sources
            </span>
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-4 overflow-x-auto border-t border-rule/60 px-4 py-1.5 font-mono text-[10.5px] text-ink-faint sm:px-6">
          <span className="tabular-nums">{sources.length} sources</span>
          <span className="tabular-nums">{enabled} polling</span>
          <span className="tabular-nums">{contributing} contributing</span>
          {muted > 0 && <span className="tabular-nums">{muted} hidden</span>}
          {failing > 0 && (
            <span className="tabular-nums text-clay-deep">{failing} failing</span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-4xl">
        <div className="border-b border-rule px-4 py-4 sm:px-6">
          <h1 className="font-display text-[19px] text-ink">Sources</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
            Every feed latentFeed polls. <strong>Hiding</strong> a source keeps
            ingesting it but drops it out of the feed — useful for noisy sources
            you still want counting toward corroboration.{" "}
            <strong>Stopping</strong> it halts polling entirely. Feeds that fail
            five polls in a row switch themselves off with the reason recorded.
          </p>
        </div>

        <AddSourceForm />

        {grouped.map((group) => (
          <section key={group.category}>
            <h2 className="sticky top-[76px] z-10 border-b border-rule bg-paper-sunken/90 px-4 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted backdrop-blur-sm sm:px-6">
              {CATEGORY_LABELS[group.category]}
              <span className="ml-2 text-ink-faint">{group.items.length}</span>
            </h2>
            {group.items.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </section>
        ))}

        <RetiredSources sources={retired} />
      </div>
    </div>
  );
}
