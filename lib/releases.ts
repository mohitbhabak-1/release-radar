import raw from "../data/releases.json";
import type { FeatureRecord } from "../pipeline/summarize";

export type { FeatureRecord };

export type ReleasesFile = {
  generatedAt: string | null;
  lookbackDays: number;
  refresh?: { status: "ok" | "partial" | "failed"; sources: { name: string; ok: boolean }[] };
  scanned?: { org: string; repos: string[] };
  digest?: { bullets: string[]; countsByStage: Record<string, number> };
  features: FeatureRecord[];
};

export const releases = raw as unknown as ReleasesFile;

export const STAGES = ["Shipped", "Rolling out", "In review", "In development", "Planned"] as const;
export const STAGE_HEADINGS: Record<(typeof STAGES)[number], string> = {
  Shipped: "Shipped this period",
  "Rolling out": "Rolling out",
  "In review": "In review",
  "In development": "In development",
  Planned: "Planned",
};

export const ISSUES_URL = "https://github.com/mohitbhabak-1/release-radar/issues";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

export function formatTimestamp(iso?: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
