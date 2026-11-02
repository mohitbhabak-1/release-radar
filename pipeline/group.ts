import { conventionalType } from "./filter";
import type { Signal } from "./types";

export type FeatureGroup = {
  id: string;
  /** rollup = merged by a config rule; ticket = linked by shared Linear ID; cluster = near-identical PR titles in one repo; pr / release = standalone */
  kind: "ticket" | "cluster" | "pr" | "release" | "rollup";
  title: string; // representative raw title (the LLM writes the plain-English one in Phase 5)
  signals: Signal[];
  linearIds: string[];
  repos: string[];
  owners: string[];
  latestDate: string;
  changeTypes: Record<string, number>;
  hasFeatureSignal: boolean;
  confidence: "high" | "medium" | "low";
  shippedIn: { id: string; title: string; url: string }[];
};

class UnionFind {
  private p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.p[i] !== i) i = this.p[i] = this.p[this.p[i]];
    return i;
  }
  union(a: number, b: number) {
    this.p[this.find(a)] = this.find(b);
  }
}

const FEATURE_LABELS = new Set(["feature", "enhancement"]);

export function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\(#?\d+\)/g, "").replace(/[\d#]+/g, "").replace(/\s+/g, " ").trim();
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function groupSignals(input: Signal[], rollups: { name: string; pattern: string }[] = []): FeatureGroup[] {
  const prs = input.filter((s) => s.source !== "github_release");
  const releases = input.filter((s) => s.source === "github_release");
  const uf = new UnionFind(prs.length);

  // 1. Shared Linear ID => same feature.
  const byTicket = new Map<string, number>();
  prs.forEach((s, i) => {
    for (const id of s.linearIds) {
      const j = byTicket.get(id);
      if (j === undefined) byTicket.set(id, i);
      else uf.union(i, j);
    }
  });

  // 2. Repeated near-identical titles with no ticket (e.g. automated onboarding PRs) => one cluster.
  const byTitle = new Map<string, number>();
  prs.forEach((s, i) => {
    if (s.linearIds.length) return;
    const key = `${s.team}|${normalizeTitle(s.title)}`;
    const j = byTitle.get(key);
    if (j === undefined) byTitle.set(key, i);
    else uf.union(i, j);
  });

  const buckets = new Map<number, Signal[]>();
  prs.forEach((s, i) => {
    const r = uf.find(i);
    buckets.set(r, [...(buckets.get(r) ?? []), s]);
  });

  // 3. Releases that mention a merged PR (#123) are evidence for that PR's feature, not features themselves.
  const prRoot = new Map<string, number>(prs.map((s, i) => [s.id, uf.find(i)]));
  const shipped = new Map<number, FeatureGroup["shippedIn"]>();
  const standaloneReleases: Signal[] = [];
  for (const rel of releases) {
    const refs = [...rel.body.matchAll(/#(\d+)/g)].map((m) => `${rel.team}#${m[1]}`);
    const roots = new Set(refs.map((r) => prRoot.get(r)).filter((r): r is number => r !== undefined));
    if (!roots.size) standaloneReleases.push(rel);
    for (const r of roots) shipped.set(r, [...(shipped.get(r) ?? []), { id: rel.id, title: rel.title, url: rel.url }]);
  }

  const groups: FeatureGroup[] = [];
  for (const [root, sigs] of buckets) groups.push(build(sigs, shipped.get(root) ?? []));
  for (const rel of standaloneReleases) groups.push(build([rel], []));
  return applyRollups(groups, rollups).sort((a, b) => b.latestDate.localeCompare(a.latestDate));
}

function applyRollups(groups: FeatureGroup[], rules: { name: string; pattern: string }[]): FeatureGroup[] {
  if (!rules.length) return groups;
  const compiled = rules.map((r) => ({ ...r, re: new RegExp(r.pattern, "i") }));
  const merged = new Map<string, FeatureGroup[]>();
  const rest: FeatureGroup[] = [];
  for (const g of groups) {
    const rule = compiled.find((r) => g.signals.some((s) => r.re.test(s.title)));
    if (!rule) rest.push(g);
    else merged.set(rule.name, [...(merged.get(rule.name) ?? []), g]);
  }
  for (const [name, gs] of merged) {
    if (gs.length === 1) { rest.push(gs[0]); continue; } // nothing to roll up
    rest.push(build(gs.flatMap((g) => g.signals), gs.flatMap((g) => g.shippedIn), name));
  }
  return rest;
}

function build(signals: Signal[], shippedIn: FeatureGroup["shippedIn"], rollupName?: string): FeatureGroup {
  const sorted = [...signals].sort((a, b) => b.date.localeCompare(a.date));
  const linearIds = [...new Set(sorted.flatMap((s) => s.linearIds))].sort();
  const changeTypes: Record<string, number> = {};
  for (const s of sorted) {
    const t = conventionalType(s.title) ?? "other";
    changeTypes[t] = (changeTypes[t] ?? 0) + 1;
  }
  const isFeat = (s: Signal) =>
    conventionalType(s.title) === "feat" || s.labels.some((l) => FEATURE_LABELS.has(l.toLowerCase()));
  const hasFeatureSignal = sorted.some(isFeat);
  const rep = sorted.find(isFeat) ?? sorted[0];

  const isRelease = sorted.every((s) => s.source === "github_release");
  const kind: FeatureGroup["kind"] = rollupName ? "rollup" : isRelease ? "release" : linearIds.length ? "ticket" : sorted.length > 1 ? "cluster" : "pr";
  const confidence: FeatureGroup["confidence"] =
    (kind === "ticket" || kind === "rollup") && hasFeatureSignal ? "high" : hasFeatureSignal || kind === "ticket" || kind === "rollup" ? "medium" : "low";

  const first = sorted[sorted.length - 1];
  return {
    id: rollupName ? `rollup-${slug(rollupName)}` : slug(linearIds[0] ?? first.id),
    kind,
    title: rollupName ?? rep.title,
    signals: sorted,
    linearIds,
    repos: [...new Set(sorted.map((s) => s.team).filter((t): t is string => !!t))],
    owners: [...new Set(sorted.map((s) => s.owner).filter((o): o is string => !!o))],
    latestDate: sorted[0].date,
    changeTypes,
    hasFeatureSignal,
    confidence,
    shippedIn,
  };
}
