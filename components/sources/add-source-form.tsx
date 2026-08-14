"use client";

import { CheckCircle2, Plus, XCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { addSource, testFeed, type ActionResult } from "@/app/sources/actions";
import { ALL_ORGS } from "@/lib/orgs";
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  SOURCE_CATEGORIES,
  SOURCE_KINDS,
} from "@/lib/sources/labels";
import { cn } from "@/lib/utils";

const EMPTY = {
  name: "",
  feedUrl: "",
  kind: "",
  category: "press",
  baseCredibility: "3",
  orgSlug: "",
  pollMinutes: "30",
};

/**
 * Add a custom feed.
 *
 * "Test" probes the URL without saving so a dead or non-feed URL is caught
 * before it joins the list; saving re-probes and refuses anything that parses
 * to zero items.
 *
 * Every field is controlled. React resets an uncontrolled form after a
 * `useActionState` submit completes, which meant pressing "Test feed" erased
 * everything the user had just typed.
 */
export function AddSourceForm() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);

  const set = (key: keyof typeof EMPTY) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const [addState, addAction, adding] = useActionState<
    ActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await addSource(prev, formData);
    if (result.ok) {
      setValues(EMPTY);
      setOpen(false);
    }
    return result;
  }, null);

  const [testState, testAction, testing] = useActionState<
    ActionResult | null,
    FormData
  >(testFeed, null);

  if (!open) {
    return (
      <div className="px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a feed
        </button>
        {addState?.ok && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
            {addState.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-rule bg-paper-raised px-4 py-4 sm:px-6">
      <form action={addAction}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              name="name"
              value={values.name}
              onChange={set("name")}
              required
              maxLength={120}
              placeholder="Latent Space"
              className={inputClass}
            />
          </Field>

          <Field label="Feed URL">
            <input
              name="feedUrl"
              type="url"
              value={values.feedUrl}
              onChange={set("feedUrl")}
              required
              placeholder="https://example.com/feed.xml"
              className={cn(inputClass, "font-mono text-[11px]")}
            />
          </Field>

          <Field label="Type" hint="Auto-detected from the URL if left blank">
            <select
              name="kind"
              value={values.kind}
              onChange={set("kind")}
              className={inputClass}
            >
              <option value="">Auto-detect</option>
              {SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Group">
            <select
              name="category"
              value={values.category}
              onChange={set("category")}
              className={inputClass}
            >
              {SOURCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Base credibility"
            hint="Where articles from this source start, 1–5"
          >
            <select
              name="baseCredibility"
              value={values.baseCredibility}
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

          <Field label="Company" hint="Only if the feed covers one company">
            <select
              name="orgSlug"
              value={values.orgSlug}
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

          <Field label="Poll interval (minutes)">
            <input
              name="pollMinutes"
              type="number"
              min={5}
              max={1440}
              value={values.pollMinutes}
              onChange={set("pollMinutes")}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {adding ? "Checking feed…" : "Add source"}
          </button>

          {/* formAction routes this submit to the probe instead of the insert. */}
          <button
            type="submit"
            formAction={testAction}
            formNoValidate
            disabled={testing}
            className="rounded-md border border-rule px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test feed"}
          </button>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </div>

        <Result state={testState} />
        <Result state={addState?.ok ? null : addState} />
      </form>
    </div>
  );
}

function Result({ state }: { state: ActionResult | null | undefined }) {
  if (!state) return null;
  return (
    <p
      className={cn(
        "mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed",
        state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-clay-deep",
      )}
    >
      {state.ok ? (
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
      ) : (
        <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 break-words">{state.message}</span>
    </p>
  );
}

const inputClass =
  "w-full rounded-md border border-rule bg-paper px-2 py-1.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-clay focus:outline-none";

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
