"use client";

import { useMemo, useState } from "react";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "../../lib/filters";
import { STAGES, STAGE_HEADINGS, type FeatureRecord } from "../../lib/releases";
import { Card } from "./Card";

const field = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function Feed({ features }: { features: FeatureRecord[] }) {
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  const areas = useMemo(() => [...new Set(features.map((x) => x.productArea))].sort(), [features]);
  const repos = useMemo(() => [...new Set(features.flatMap((x) => x.repos))].sort(), [features]);
  const shown = useMemo(() => applyFilters(features, f), [features, f]);
  const dirty = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS);

  const toggle = (k: "pmm" | "design" | "docs", label: string) => (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
      <input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} className="size-4 accent-indigo-600" />
      {label}
    </label>
  );

  return (
    <>
      <form role="search" aria-label="Filter features" onSubmit={(e) => e.preventDefault()}
        className="no-print sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="q">Search</label>
          <input id="q" type="search" placeholder="Search features…" value={f.query} onChange={(e) => set("query", e.target.value)} className={`${field} min-w-44 flex-1`} />
          <label className="sr-only" htmlFor="area">Product area</label>
          <select id="area" value={f.area} onChange={(e) => set("area", e.target.value)} className={field}>
            <option value="">All areas</option>
            {areas.map((a) => <option key={a}>{a}</option>)}
          </select>
          <label className="sr-only" htmlFor="stage">Stage</label>
          <select id="stage" value={f.stage} onChange={(e) => set("stage", e.target.value)} className={field}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <label className="sr-only" htmlFor="repo">Team or repo</label>
          <select id="repo" value={f.repo} onChange={(e) => set("repo", e.target.value)} className={field}>
            <option value="">All repos</option>
            {repos.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {toggle("pmm", "Needs PMM")}
          {toggle("design", "Needs design")}
          {toggle("docs", "Needs docs")}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
            <input type="checkbox" checked={f.showAll} onChange={(e) => set("showAll", e.target.checked)} className="size-4 accent-indigo-600" />
            Show low-confidence &amp; internal
          </label>
          {dirty && (
            <button type="button" onClick={() => setF(DEFAULT_FILTERS)} className="text-sm text-indigo-700 underline underline-offset-2 dark:text-indigo-300">Clear filters</button>
          )}
          <span role="status" aria-live="polite" className="ml-auto text-sm text-neutral-600 dark:text-neutral-400">{shown.length} feature{shown.length === 1 ? "" : "s"}</span>
        </div>
      </form>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-neutral-600 dark:text-neutral-400">
          No features match these filters.{" "}
          {dirty && <button type="button" onClick={() => setF(DEFAULT_FILTERS)} className="text-indigo-700 underline dark:text-indigo-300">Clear filters</button>}
        </p>
      ) : (
        STAGES.map((stage) => {
          const items = shown.filter((x) => x.stage === stage);
          if (!items.length) return null;
          return (
            <section key={stage} aria-labelledby={`h-${stage}`} className="mt-8">
              <h2 id={`h-${stage}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                {STAGE_HEADINGS[stage]} <span className="font-normal">({items.length})</span>
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((x) => <Card key={x.id} f={x} />)}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
