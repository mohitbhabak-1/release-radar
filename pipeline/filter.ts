import type { Config } from "./config";
import type { Signal } from "./types";

export type Dropped = { id: string; title: string; reason: string };

/** `feat(scope)!: ...` -> "feat". Undefined when the title isn't conventional-commit style. */
export function conventionalType(title: string): string | undefined {
  return title.match(/^(\w+)(\(.+?\))?!?:/)?.[1]?.toLowerCase();
}

export function conventionalScope(title: string): string | undefined {
  return title.match(/^\w+\((.+?)\)!?:/)?.[1]?.toLowerCase();
}

const VERSION_BUMP_LINE = /^[@\w/.-]+:\s*v?\d[\w.-]*\s*->\s*v?\d[\w.-]*$/;

/** Monorepo release notes that only list `pkg: 1.0.0 -> 1.0.1` carry no feature information. */
export function isVersionBumpOnly(body: string): boolean {
  let lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  // Bodies are truncated to ~2,000 chars, which can cut the final line mid-way.
  if (body.endsWith("…")) lines = lines.slice(0, -1);
  return lines.length > 0 && lines.every((l) => VERSION_BUMP_LINE.test(l));
}

export function filterSignals(signals: Signal[], cfg: Config): { kept: Signal[]; dropped: Dropped[] } {
  const patterns = cfg.github.exclude_title_patterns.map((p) => ({ src: p, re: new RegExp(p, "i") }));
  const labels = new Set(cfg.github.exclude_labels.map((l) => l.toLowerCase()));
  const authors = new Set(cfg.github.exclude_authors.map((a) => a.toLowerCase()));
  const kept: Signal[] = [];
  const dropped: Dropped[] = [];

  for (const s of signals) {
    const reason = dropReason(s);
    if (reason) dropped.push({ id: s.id, title: s.title, reason });
    else kept.push(s);
  }
  return { kept, dropped };

  function dropReason(s: Signal): string | undefined {
    if (s.owner && authors.has(s.owner.toLowerCase())) return `author: ${s.owner}`;
    if (s.source === "github_release" && isVersionBumpOnly(s.body)) return "release is only package version bumps";
    const label = s.labels.find((l) => labels.has(l.toLowerCase()));
    if (label) return `label: ${label}`;
    const hit = patterns.find((p) => p.re.test(s.title));
    if (hit) return `title matches ${hit.src}`;
  }
}
