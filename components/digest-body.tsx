import { ExternalLink } from "lucide-react";

/**
 * Renders the digest's markdown.
 *
 * Deliberately a small renderer for the subset the generator emits — `###`
 * headings, paragraphs, `_italics_` and `- [text](url) — trailing` list items —
 * rather than a markdown dependency. It builds React elements, never
 * `dangerouslySetInnerHTML`, so model-authored text can't inject markup.
 */
export function DigestBody({ markdown }: { markdown: string }) {
  const blocks = markdown.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="mt-2 space-y-1">
        {listItems}
      </ul>,
    );
    listItems = [];
  };

  blocks.forEach((line, i) => {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushList();
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      nodes.push(
        <h3
          key={i}
          className="mt-6 font-display text-[16px] leading-snug text-ink first:mt-0"
        >
          {trimmed.slice(4)}
        </h3>,
      );
      return;
    }

    if (trimmed.startsWith("- ")) {
      listItems.push(<ListItem key={i} raw={trimmed.slice(2)} />);
      return;
    }

    flushList();
    nodes.push(
      <p key={i} className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
        {renderInline(trimmed)}
      </p>,
    );
  });

  flushList();
  return <div>{nodes}</div>;
}

/** `[title](url) — trailing note` */
function ListItem({ raw }: { raw: string }) {
  const match = raw.match(/^\[([^\]]+)\]\(([^)]+)\)\s*(?:—\s*(.*))?$/);

  if (!match) {
    return <li className="text-[12.5px] text-ink-muted">{raw}</li>;
  }

  const [, title, url, trailing] = match;
  return (
    <li className="text-[12.5px] leading-relaxed">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-baseline gap-1 text-ink-muted transition-colors hover:text-ink"
      >
        <span>{title}</span>
        <ExternalLink className="h-3 w-3 shrink-0 self-center text-ink-faint" />
      </a>
      {trailing && <span className="ml-1 text-ink-faint">— {trailing}</span>}
    </li>
  );
}

/** Only `_italics_`; everything else stays literal text. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(_[^_]+_)/g);
  return parts.map((part, i) =>
    part.startsWith("_") && part.endsWith("_") && part.length > 2 ? (
      <em key={i} className="text-ink-faint">
        {part.slice(1, -1)}
      </em>
    ) : (
      part
    ),
  );
}
