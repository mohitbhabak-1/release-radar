import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, releases } from "../../../lib/releases";

export const dynamicParams = false;

export function generateStaticParams() {
  return releases.features.map((f) => ({ id: f.id }));
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const f = releases.features.find((x) => x.id === id);
  return { title: f ? `${f.title} · Release Radar` : "Release Radar" };
}

const SOURCE_LABEL = {
  github_pr: "Pull request",
  github_release: "Release",
  linear_issue: "Linear issue",
  linear_project: "Linear project",
} as const;

const link = "text-indigo-700 underline underline-offset-2 dark:text-indigo-300";
const muted = "text-neutral-600 dark:text-neutral-400";

export default async function FeaturePage({ params }: Props) {
  const { id } = await params;
  const f = releases.features.find((x) => x.id === id);
  if (!f) notFound();

  const flags = [f.needsAttention.pmm && "PMM", f.needsAttention.design && "Design", f.needsAttention.docs && "Docs"].filter(Boolean);
  const signals = [...f.signals].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/" className={`text-sm ${link}`}>← Back to Release Radar</Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{f.title}</h1>
      <p className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm ${muted}`}>
        <span>{f.productArea}</span>
        <span>{f.stage}</span>
        {f.expectedDate && <time dateTime={f.expectedDate}>{formatDate(f.expectedDate)}</time>}
        <span>Confidence: {f.confidence}</span>
        {!f.isCustomerFacing && <span>Marked internal</span>}
      </p>

      <p className="mt-4">{f.oneLiner}</p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">Why it matters</h2>
      <p className="mt-1">{f.whyItMatters}</p>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {f.owner && (<><dt className={muted}>Owner</dt><dd>{f.owner}</dd></>)}
        {f.audience.length > 0 && (<><dt className={muted}>Audience</dt><dd>{f.audience.join(", ")}</dd></>)}
        {flags.length > 0 && (<><dt className={muted}>Needs attention from</dt><dd>{flags.join(", ")}</dd></>)}
        {f.repos.length > 0 && (<><dt className={muted}>Repos</dt><dd>{f.repos.join(", ")}</dd></>)}
        {f.linearIds.length > 0 && (<><dt className={muted}>Ticket IDs</dt><dd>{f.linearIds.join(", ")}</dd></>)}
        {f.stageOverrideReason && (<><dt className={muted}>Stage note</dt><dd>{f.stageOverrideReason}</dd></>)}
      </dl>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
        Evidence behind this summary ({signals.length})
      </h2>
      <p className={`mt-1 text-sm ${muted}`}>
        The summary above was written by AI from these items. Open them to check it.
      </p>
      <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {signals.map((s) => (
          <li key={s.id} className="p-3 text-sm">
            <a href={s.url} target="_blank" rel="noreferrer" className={link}>
              {s.title}<span className="sr-only"> (opens in new tab)</span>
            </a>
            <p className={`mt-1 text-xs ${muted}`}>
              {SOURCE_LABEL[s.source]} · {s.id} · {s.status}
              {s.date && <> · {formatDate(s.date)}</>}
              {s.labels.length > 0 && <> · {s.labels.join(", ")}</>}
            </p>
          </li>
        ))}
      </ul>

      {f.links.length > signals.length && (
        <p className={`mt-3 text-xs ${muted}`}>
          Also shipped in:{" "}
          {f.links.filter((l) => !signals.some((s) => s.url === l.url)).map((l, i) => (
            <span key={l.url}>{i > 0 && ", "}<a href={l.url} target="_blank" rel="noreferrer" className={link}>{l.label}</a></span>
          ))}
        </p>
      )}
    </main>
  );
}
