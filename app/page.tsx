import { ISSUES_URL, STAGES, formatTimestamp, releases } from "../lib/releases";
import { applyFilters, DEFAULT_FILTERS } from "../lib/filters";
import { Feed } from "./components/Feed";

const STATUS = {
  ok: { dot: "bg-emerald-500", label: "All sources refreshed" },
  partial: { dot: "bg-amber-500", label: "Partial refresh: some sources or summaries are missing" },
  failed: { dot: "bg-red-500", label: "Refresh failed: data may be stale" },
} as const;

export default function Home() {
  const { features, digest, refresh, scanned, generatedAt, lookbackDays } = releases;
  const status = STATUS[refresh?.status ?? "failed"];
  const hasData = features.length > 0;
  // Counts match the default list (customer-facing, not low-confidence) so pills agree with what's shown.
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<string, number>;
  for (const x of applyFilters(features, DEFAULT_FILTERS)) counts[x.stage]++;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Release Radar</h1>
          <nav className="no-print text-sm"><a href="/digest" className="text-indigo-700 underline underline-offset-2 dark:text-indigo-300">Copy-paste digest</a></nav>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <span>Last {lookbackDays} days</span>
          <span>Refreshed {formatTimestamp(generatedAt)}</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </p>
      </header>

      {!hasData ? (
        <p className="py-24 text-center text-neutral-600 dark:text-neutral-400">No release data yet. The pipeline hasn't produced a summary.</p>
      ) : (
        <>
          <section aria-labelledby="glance" className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 id="glance" className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">This week at a glance</h2>
            {digest && digest.bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-neutral-400">
                {digest.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            )}
            {(
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Customer-facing features by stage">
                {STAGES.map((s) => (
                  <li key={s} className={`rounded-full border px-2.5 py-0.5 text-xs ${counts[s] ? "border-neutral-400 text-neutral-900 dark:border-neutral-500 dark:text-neutral-100" : "border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-500"}`}>
                    {s} <strong>{counts[s] ?? 0}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Feed features={features} areaOrder={releases.areas} />
        </>
      )}

      <footer className="no-print mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        {scanned && (
          <p>
            Sources scanned: merged pull requests and releases in <strong className="font-medium text-neutral-800 dark:text-neutral-200">{scanned.org}</strong> repos
            {scanned.repos.length > 0 && <> with activity ({scanned.repos.join(", ")})</>}. Summaries are AI-generated from titles and descriptions; check the linked items before relying on them.
          </p>
        )}
        <p className="mt-2"><a href={ISSUES_URL} className="text-indigo-700 underline underline-offset-2 dark:text-indigo-300">Report an issue</a></p>
      </footer>
    </div>
  );
}
