import type { Signal } from "./types";

export const MAX_BODY_CHARS = 2000;

// Things shaped like ABC-123 that are not tickets.
const DEFAULT_IGNORE_PREFIXES = [
  "UTF", "SHA", "ISO", "RFC", "CVE", "HTTP", "TLS", "AES", "RSA", "BIP", "EIP", "ERC", "SLIP", "CWE", "RUSTSEC", "SIMD", "GHSA", "PR", "V",
];

const LINEAR_ID_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g;

export function extractLinearIds(texts: Array<string | null | undefined>, extraIgnore: string[] = []): string[] {
  const ignore = new Set([...DEFAULT_IGNORE_PREFIXES, ...extraIgnore].map((p) => p.toUpperCase()));
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(LINEAR_ID_RE)) {
      // Real team keys have 2+ letters; this rejects regex artifacts like "Z0-9" from character classes.
      if (!ignore.has(m[1]) && Number(m[2]) > 0 && (m[1].match(/[A-Z]/g) ?? []).length >= 2) found.add(`${m[1]}-${m[2]}`);
    }
  }
  return [...found].sort();
}

/** Linear branch names look like `user/wal-99-title` (lowercase); only trust the ID in leading position. */
export function extractLinearIdFromBranch(branch: string | null | undefined, extraIgnore: string[] = []): string[] {
  const m = branch?.match(/^(?:[^/]+\/)?([a-zA-Z][a-zA-Z0-9]{1,9}-\d{1,6})(?![\w])/);
  return m ? extractLinearIds([m[1].toUpperCase()], extraIgnore) : [];
}

export function truncate(s: string, max = MAX_BODY_CHARS): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Drop HTML comments (PR templates), collapse blank runs, truncate. */
export function cleanBody(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return truncate(s);
}

export type RawPr = {
  number: number;
  updatedAt?: string;
  title: string;
  body: string | null;
  url: string;
  mergedAt: string | null;
  headRefName: string;
  author: { login: string } | null;
  labels: { nodes: { name: string }[] };
  repository: { name: string };
};

export type RawRelease = {
  name: string | null;
  tagName: string;
  url: string;
  description: string | null;
  publishedAt: string | null;
  isPrerelease: boolean;
  author: { login: string } | null;
};

export function normalizePr(pr: RawPr, ignorePrefixes: string[] = []): Signal {
  return {
    source: "github_pr",
    id: `${pr.repository.name}#${pr.number}`,
    title: pr.title,
    body: cleanBody(pr.body),
    url: pr.url,
    team: pr.repository.name,
    owner: pr.author?.login,
    status: "Merged",
    date: pr.mergedAt ?? "",
    linearIds: [
      ...new Set([...extractLinearIds([pr.title, pr.body], ignorePrefixes), ...extractLinearIdFromBranch(pr.headRefName, ignorePrefixes)]),
    ].sort(),
    labels: pr.labels.nodes.map((l) => l.name),
  };
}

export function normalizeOpenPr(pr: RawPr, approved: boolean, ignorePrefixes: string[] = []): Signal {
  return { ...normalizePr(pr, ignorePrefixes), status: approved ? "Approved" : "Open", date: pr.updatedAt ?? "" };
}

export function normalizeRelease(repo: string, r: RawRelease, ignorePrefixes: string[] = []): Signal {
  const title = r.name?.trim() || r.tagName;
  return {
    source: "github_release",
    id: `${repo}@${r.tagName}`,
    title,
    body: cleanBody(r.description),
    url: r.url,
    team: repo,
    owner: r.author?.login,
    status: r.isPrerelease ? "Pre-release" : "Released",
    date: r.publishedAt ?? "",
    linearIds: extractLinearIds([title, r.tagName, r.description], ignorePrefixes),
    labels: [],
  };
}
