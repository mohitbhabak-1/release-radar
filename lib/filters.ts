import type { FeatureRecord } from "./releases";

export type Filters = {
  query: string;
  area: string;
  stage: string;
  repo: string;
  pmm: boolean;
  design: boolean;
  docs: boolean;
  showAll: boolean; // include low-confidence and non-customer-facing items
};

export const DEFAULT_FILTERS: Filters = { query: "", area: "", stage: "", repo: "", pmm: false, design: false, docs: false, showAll: false };

export function matches(f: FeatureRecord, x: Filters): boolean {
  if (!x.showAll && (!f.isCustomerFacing || f.confidence === "low")) return false;
  if (x.area && f.productArea !== x.area) return false;
  if (x.stage && f.stage !== x.stage) return false;
  if (x.repo && !f.repos.includes(x.repo)) return false;
  if (x.pmm && !f.needsAttention.pmm) return false;
  if (x.design && !f.needsAttention.design) return false;
  if (x.docs && !f.needsAttention.docs) return false;
  const q = x.query.trim().toLowerCase();
  if (q) {
    const hay = [f.title, f.oneLiner, f.whyItMatters, f.productArea, f.owner ?? "", ...f.audience, ...f.linearIds, ...f.repos].join(" ").toLowerCase();
    if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
  }
  return true;
}

export function applyFilters(all: FeatureRecord[], x: Filters): FeatureRecord[] {
  return all.filter((f) => matches(f, x)).sort((a, b) => (b.expectedDate ?? "").localeCompare(a.expectedDate ?? ""));
}
