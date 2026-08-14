import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { DigestBody } from "@/components/digest-body";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDigest } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DigestDayPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const { day } = await params;
  const brief = await getDigest(day);
  if (!brief) notFound();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
          <a href="/" className="font-display text-[17px] tracking-tight text-ink">
            latent<span className="text-clay">Feed</span>
          </a>
          <a
            href="/digest"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All briefs
          </a>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <article className="max-w-[46rem] px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="font-display text-[22px] leading-tight text-ink">
            {brief.title}
          </h1>
          <time className="font-mono text-[11px] text-ink-faint">{brief.day}</time>
        </div>

        <div className="mt-4 border-t border-rule pt-4">
          <DigestBody markdown={brief.bodyMarkdown} />
        </div>
      </article>
    </div>
  );
}
