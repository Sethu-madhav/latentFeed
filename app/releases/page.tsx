import { Package } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getReleases, type ReleaseProject } from "@/lib/data";
import { ORG_BY_SLUG } from "@/lib/orgs";
import { cadenceLabel } from "@/lib/releases";
import { cn, timeAgo, truncate } from "@/lib/utils";
import { SourcesLink } from "@/components/sources-link";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  const projects = await getReleases();

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
              Releases
            </span>
            <SourcesLink className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink" />
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-[60rem] px-4 py-5 sm:px-6">
        <h1 className="flex items-center gap-2 font-display text-[19px] text-ink">
          <Package className="h-4 w-4 text-clay" />
          Releases
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
          Shipping activity for the agent harnesses and inference engines this
          feed tracks — what shipped, how recently, and how fast each project
          moves.
        </p>

        {projects.length === 0 ? (
          <p className="mt-6 text-[13px] text-ink-muted">
            No releases ingested yet — run{" "}
            <code className="font-mono text-[12px]">npm run ingest:once</code>.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.repo} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ReleaseProject }) {
  const org = project.orgSlug ? ORG_BY_SLUG.get(project.orgSlug) : undefined;
  const accent = org?.accent ?? "#8b8b8b";

  return (
    <section className="overflow-hidden rounded-lg border border-rule bg-paper-raised">
      <span
        aria-hidden
        className="block h-[3px] w-full"
        style={{ backgroundColor: accent }}
      />

      <div className="px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <a
            href={`https://github.com/${project.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate font-display text-[15px] text-ink decoration-clay/50 underline-offset-[3px] hover:underline"
          >
            {project.name}
          </a>
          <a
            href={`/?src=${project.sourceSlug}`}
            className="shrink-0 font-mono text-[10px] text-ink-faint transition-colors hover:text-ink-muted"
            title="See this project's releases in the feed"
          >
            {project.repo.split("/")[0]}
          </a>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <VersionPill release={project.latest} />
            <span suppressHydrationWarning>
              {timeAgo(project.latest.publishedAt)}
            </span>
          </span>
          <span title="Releases seen per week across the tracked window">
            {cadenceLabel(project.cadence)}
          </span>
          {project.last7d > 0 && (
            <span className="tabular-nums">{project.last7d} in 7d</span>
          )}
        </div>

        {project.latest.summary && (
          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
            {truncate(project.latest.summary, 170)}
          </p>
        )}

        <ol className="mt-2.5 flex flex-wrap gap-1">
          {project.releases.slice(0, 8).map((release) => (
            <li key={release.id}>
              <a
                href={release.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${release.tag} — ${release.publishedAt.toLocaleString()}`}
                className={cn(
                  "block rounded-sm px-1.5 py-px font-mono text-[10px] transition-colors",
                  release.isPrerelease
                    ? "bg-clay-wash text-clay-deep hover:bg-clay/20"
                    : "bg-paper-sunken text-ink-muted hover:text-ink",
                )}
              >
                {release.version}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function VersionPill({
  release,
}: {
  release: ReleaseProject["latest"];
}) {
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-px font-mono text-[10px] font-medium",
        release.isPrerelease
          ? "bg-clay/15 text-clay-deep"
          : "bg-paper-sunken text-ink",
      )}
      title={
        release.isBuild
          ? "Build counter, not a semantic version"
          : release.isPrerelease
            ? `Pre-release (${release.channel})`
            : "Stable release"
      }
    >
      {release.version}
      {release.isPrerelease && ` ${release.channel}`}
    </span>
  );
}
