"use client";

import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Power,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import {
  deleteSource,
  resetSourceFailures,
  setSourceEnabled,
  setSourceMuted,
  updateSource,
  type ActionResult,
} from "@/app/sources/actions";
import type { SourceHealth } from "@/lib/data";
import { ALL_ORGS } from "@/lib/orgs";
import { KIND_LABELS } from "@/lib/sources/labels";
import { cn, relativeTime } from "@/lib/utils";

function IconButton({
  onClick,
  title,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "rounded-md border border-rule p-1.5 transition-colors disabled:opacity-40",
        danger
          ? "text-clay-deep hover:bg-clay-wash"
          : "text-ink-muted hover:bg-paper-sunken hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Green healthy, clay failing, grey off. */
function StatusDot({ source }: { source: SourceHealth }) {
  const state = !source.enabled
    ? { color: "bg-ink-faint", label: "Polling off" }
    : source.consecutiveFailures > 0
      ? { color: "bg-clay", label: `${source.consecutiveFailures} consecutive failures` }
      : { color: "bg-emerald-500", label: "Healthy" };

  return (
    <span
      className={cn("mt-1.5 block h-2 w-2 shrink-0 rounded-full", state.color)}
      title={state.label}
    />
  );
}

export function SourceRow({ source }: { source: SourceHealth }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // Controlled, because React resets an uncontrolled form once a
  // `useActionState` submit resolves — which would wipe the user's edits on a
  // validation failure, exactly when they most need them kept.
  const [form, setForm] = useState({
    name: source.name,
    feedUrl: source.feedUrl ?? "",
    baseCredibility: String(source.baseCredibility),
    pollMinutes: String(source.pollMinutes),
    orgSlug: source.orgSlug ?? "",
  });

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((v) => ({ ...v, [key]: e.target.value }));

  const [saveState, saveAction] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await updateSource(prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    null,
  );

  const muted = source.mutedAt !== null;

  return (
    <div
      className={cn(
        "border-b border-rule px-4 py-3 transition-colors sm:px-6",
        !source.enabled && "bg-paper-sunken/50",
      )}
    >
      <div className="flex items-start gap-3">
        <StatusDot source={source} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn(
                "text-[14px] font-medium",
                source.enabled ? "text-ink" : "text-ink-muted",
              )}
            >
              {source.name}
            </span>
            <span className="font-mono text-[10px] text-ink-faint">
              {KIND_LABELS[source.kind]}
            </span>
            {muted && (
              <span className="rounded-sm bg-paper-sunken px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-ink-muted">
                Hidden
              </span>
            )}
            {source.managedByUser && (
              <span
                className="rounded-sm bg-clay-wash px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-clay-deep"
                title="Edited by you — a re-seed won't overwrite it"
              >
                Custom
              </span>
            )}
          </div>

          <a
            href={source.feedUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-faint hover:text-ink-muted"
          >
            {source.feedUrl}
          </a>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-faint">
            <span title="Credibility this source starts at, before per-article adjustments">
              base {source.baseCredibility}/5
            </span>
            <span>every {source.pollMinutes}m</span>
            <span className="tabular-nums">
              {source.articleCount.toLocaleString()} articles
            </span>
            <span className="tabular-nums">+{source.itemsNew7d} in 7d</span>
            {source.lastPolledAt && (
              // Server and client evaluate this seconds apart, so the rendered
              // string can differ ("16m" vs "17m"). The drift is cosmetic and
              // self-corrects; suppressing is the intended escape hatch.
              <span
                title={source.lastPolledAt.toLocaleString()}
                suppressHydrationWarning
              >
                polled {relativeTime(source.lastPolledAt)} ago
              </span>
            )}
          </div>

          {(source.lastError || source.disabledReason) && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-clay-deep">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">
                {source.disabledReason ?? source.lastError}
              </span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            title={muted ? "Show in feed" : "Hide from feed (keeps ingesting)"}
            disabled={pending}
            onClick={() =>
              startTransition(() => void setSourceMuted(source.id, !muted))
            }
          >
            {muted ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </IconButton>

          {source.consecutiveFailures > 0 && source.enabled && (
            <IconButton
              title="Clear failure count"
              disabled={pending}
              onClick={() =>
                startTransition(() => void resetSourceFailures(source.id))
              }
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </IconButton>
          )}

          <IconButton
            title={source.enabled ? "Stop polling" : "Resume polling"}
            disabled={pending}
            onClick={() =>
              startTransition(
                () => void setSourceEnabled(source.id, !source.enabled),
              )
            }
          >
            <Power
              className={cn(
                "h-3.5 w-3.5",
                source.enabled ? "text-emerald-600" : "text-ink-faint",
              )}
            />
          </IconButton>

          <IconButton
            title="Edit"
            disabled={pending}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </IconButton>

          <IconButton
            title="Remove source"
            danger
            disabled={pending}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {confirmingDelete && (
        <div className="mt-3 rounded-md border border-clay/40 bg-clay-wash px-3 py-2.5">
          <p className="text-[12.5px] leading-relaxed text-ink">
            Remove <strong>{source.name}</strong> and delete its{" "}
            <strong>{source.articleCount.toLocaleString()} articles</strong>?
            {source.articleCount > 0 && (
              <span className="text-ink-muted">
                {" "}
                Re-adding the feed won&apos;t bring back items that have since
                fallen out of it. To just stop it, use the power button instead.
              </span>
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => void deleteSource(source.id))
              }
              className="rounded-md bg-clay px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-clay-deep disabled:opacity-50"
            >
              Remove permanently
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-rule px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing && (
        <form
          action={saveAction}
          className="mt-3 rounded-md border border-rule bg-paper-raised p-3"
        >
          <input type="hidden" name="id" value={source.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                name="name"
                value={form.name}
                onChange={set("name")}
                required
                maxLength={120}
                className={inputClass}
              />
            </Field>
            <Field label="Feed URL">
              <input
                name="feedUrl"
                type="url"
                value={form.feedUrl}
                onChange={set("feedUrl")}
                required
                className={cn(inputClass, "font-mono text-[11px]")}
              />
            </Field>
            <Field
              label="Base credibility"
              hint="Where this source starts before per-article adjustments"
            >
              <select
                name="baseCredibility"
                value={form.baseCredibility}
                onChange={set("baseCredibility")}
                className={inputClass}
              >
                <option value="5">5 — first-party / official</option>
                <option value="4">4 — major press, established analysts</option>
                <option value="3">3 — aggregators, general tech press</option>
                <option value="2">2 — community forums</option>
                <option value="1">1 — leak trackers, rumour mills</option>
              </select>
            </Field>
            <Field label="Poll interval (minutes)">
              <input
                name="pollMinutes"
                type="number"
                min={5}
                max={1440}
                value={form.pollMinutes}
                onChange={set("pollMinutes")}
                className={inputClass}
              />
            </Field>
            <Field label="Company" hint="Set only if the feed covers one company">
              <select
                name="orgSlug"
                value={form.orgSlug}
                onChange={set("orgSlug")}
                className={inputClass}
              >
                <option value="">— none —</option>
                {ALL_ORGS.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-rule px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
            {saveState && !saveState.ok && (
              <span className="text-[12px] text-clay-deep">{saveState.message}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-rule bg-paper px-2 py-1.5 text-[12.5px] text-ink focus:border-clay focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  );
}
