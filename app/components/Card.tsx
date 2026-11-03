import { formatDate, type FeatureRecord } from "../../lib/releases";

const STAGE_STYLE: Record<string, string> = {
  Shipped: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  "Rolling out": "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  "In review": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "In development": "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  Planned: "bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
};

const FLAGS = [
  { key: "pmm", label: "PMM", hint: "Likely needs launch comms" },
  { key: "design", label: "Design", hint: "Has a UI/UX surface" },
  { key: "docs", label: "Docs", hint: "Likely needs public or API docs" },
] as const;

const VISIBLE_LINKS = 3;

export function Card({ f }: { f: FeatureRecord }) {
  const flags = FLAGS.filter((x) => f.needsAttention[x.key]);
  const extra = f.links.slice(VISIBLE_LINKS);
  const linkClass = "text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-700 dark:text-indigo-300";
  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="mr-1 text-base font-semibold leading-snug">{f.title}</h3>
        <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">{f.productArea}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLE[f.stage] ?? STAGE_STYLE.Planned}`}>{f.stage}</span>
        {f.expectedDate && <time dateTime={f.expectedDate} className="text-xs text-neutral-600 dark:text-neutral-400">{formatDate(f.expectedDate)}</time>}
        {(f.confidence === "low" || !f.isCustomerFacing) && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {!f.isCustomerFacing ? "Internal" : "Low confidence"}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-neutral-800 dark:text-neutral-200">{f.oneLiner}</p>

      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span> Why it matters
        </summary>
        <p className="mt-1 pl-4 text-sm text-neutral-700 dark:text-neutral-300">{f.whyItMatters}</p>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400">
        {f.owner && <span>Owner: <span className="text-neutral-800 dark:text-neutral-200">{f.owner}</span></span>}
        {f.audience.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Audience">
            {f.audience.map((a) => (
              <li key={a} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{a}</li>
            ))}
          </ul>
        )}
        {flags.length > 0 && (
          <ul className="flex gap-1" aria-label="Needs attention from">
            {flags.map((x) => (
              <li key={x.key} title={x.hint} className="rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                {x.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {f.links.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {f.links.slice(0, VISIBLE_LINKS).map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={linkClass}>{l.label}<span className="sr-only"> (opens in new tab)</span></a>
          ))}
          {extra.length > 0 && (
            <details className="inline">
              <summary className="inline cursor-pointer text-neutral-600 dark:text-neutral-400">+{extra.length} more</summary>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {extra.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={linkClass}>{l.label}</a>
                ))}
              </span>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
