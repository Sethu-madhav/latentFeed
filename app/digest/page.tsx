import { Newspaper } from "lucide-react";
import { DigestBody } from "@/components/digest-body";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDigests } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DigestIndexPage() {
  const briefs = await getDigests();
  const [latest, ...earlier] = briefs;

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
              Brief
            </span>
            <a
              href="/radar"
              className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              Radar
            </a>
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <article className="max-w-[46rem] px-4 py-6 sm:px-6">
        <h1 className="flex items-center gap-2 font-display text-[19px] text-ink">
          <Newspaper className="h-4 w-4 text-clay" />
          Daily brief
        </h1>

        {!latest ? (
          <p className="mt-3 text-[13px] text-ink-muted">
            No brief yet — run{" "}
            <code className="font-mono text-[12px]">npm run digest:once</code>.
          </p>
        ) : (
          <>
            <div className="mt-4 border-t border-rule pt-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="font-display text-[21px] leading-tight text-ink">
                  {latest.title}
                </h2>
                <time className="font-mono text-[11px] text-ink-faint">
                  {latest.day}
                </time>
                {latest.model === "heuristic" && (
                  <span
                    className="rounded-sm bg-paper-sunken px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-ink-faint"
                    title="Written without a model — ranked by impact score"
                  >
                    no model
                  </span>
                )}
              </div>

              <div className="mt-3">
                <DigestBody markdown={latest.bodyMarkdown} />
              </div>
            </div>

            {earlier.length > 0 && (
              <>
                <h2 className="mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                  Earlier
                </h2>
                <ul className="mt-2 divide-y divide-rule border-t border-rule">
                  {earlier.map((brief) => (
                    <li key={brief.day}>
                      <a
                        href={`/digest/${brief.day}`}
                        className="flex items-baseline justify-between gap-3 py-2 transition-colors hover:text-ink"
                      >
                        <span className="min-w-0 truncate text-[13px] text-ink-muted">
                          {brief.title}
                        </span>
                        <time className="shrink-0 font-mono text-[10.5px] text-ink-faint">
                          {brief.day}
                        </time>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </article>
    </div>
  );
}
