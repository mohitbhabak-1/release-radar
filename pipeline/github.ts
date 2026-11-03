import type { Config } from "./config";
import { normalizeOpenPr, normalizePr, normalizeRelease, type RawPr, type RawRelease } from "./normalize";
import { errMsg, type SourceStatus } from "./status";
import type { Signal } from "./types";

const API = "https://api.github.com/graphql";
const MAX_ATTEMPTS = 5;
const SEARCH_CAP = 1000; // GitHub search returns at most 1000 results per query
const RELEASE_BATCH = 15;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GqlResponse<T> = { data?: T; errors?: { type?: string; message: string }[] };

/** GraphQL call with retry/backoff for rate limits (primary + secondary) and 5xx. Never logs headers or the token. */
export async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  let lastErr = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "release-radar" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      lastErr = `network error: ${e instanceof Error ? e.message : "unknown"}`;
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 401) throw new Error("GitHub rejected the token (401). Check GITHUB_TOKEN.");

    const retryAfter = Number(res.headers.get("retry-after"));
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = Number(res.headers.get("x-ratelimit-reset"));

    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      lastErr = `HTTP ${res.status}`;
      let wait = backoff(attempt);
      if (retryAfter > 0) wait = retryAfter * 1000;
      else if (remaining === "0" && reset > 0) wait = Math.max(0, reset * 1000 - Date.now()) + 1000;
      if (res.status === 403 && remaining !== "0" && !(retryAfter > 0)) {
        throw new Error("GitHub returned 403 (token lacks access to this org/repo, or SSO authorization is missing).");
      }
      await sleep(Math.min(wait, 5 * 60_000));
      continue;
    }
    if (!res.ok) throw new Error(`GitHub API error: HTTP ${res.status}`);

    const json = (await res.json()) as GqlResponse<T>;
    if (json.errors?.length) {
      if (json.errors.some((e) => e.type === "RATE_LIMITED")) {
        lastErr = "rate limited";
        await sleep(Math.max(backoff(attempt), 30_000));
        continue;
      }
      // Partial data is acceptable only when some repos are inaccessible (NOT_FOUND on aliased repos).
      if (json.data && json.errors.every((e) => e.type === "NOT_FOUND")) return json.data;
      throw new Error(`GitHub GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    // Back off proactively when the primary budget is nearly spent.
    if (remaining !== null && Number(remaining) < 20 && reset > 0) {
      await sleep(Math.max(0, reset * 1000 - Date.now()) + 1000);
    }
    return json.data as T;
  }
  throw new Error(`GitHub request failed after ${MAX_ATTEMPTS} attempts (${lastErr})`);
}

const backoff = (attempt: number) => Math.min(2 ** attempt * 1000, 60_000) + Math.floor(Math.random() * 500);

// ---------- helpers ----------

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

function scopes(cfg: Config): string[] {
  const { org, repos } = cfg.github;
  // Search queries are capped at 256 chars, so allow-listed repos are queried one at a time.
  return repos.length ? repos.map((r) => `repo:${org}/${r}`) : [`org:${org}`];
}

function hasConfidential(labels: string[], cfg: Config): boolean {
  const deny = new Set(cfg.github.confidential_labels.map((l) => l.toLowerCase()));
  return labels.some((l) => deny.has(l.toLowerCase()));
}

// ---------- merged PRs ----------

const PR_QUERY = `
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title body url mergedAt updatedAt isDraft reviewDecision baseRefName headRefName
        author { login }
        labels(first: 30) { nodes { name } }
        repository { name isArchived defaultBranchRef { name } }
      }
    }
  }
}`;

type PrNode = RawPr & { baseRefName: string; updatedAt: string; isDraft: boolean; reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null; repository: RawPr["repository"] & { isArchived: boolean; defaultBranchRef: { name: string } | null } };
type PrSearch = { search: { issueCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (PrNode | null)[] } };

type PrKind = "merged" | "open";
const prQualifier = (kind: PrKind, from: string, to: string) =>
  kind === "merged" ? `is:merged merged:${from}..${to}` : `is:open draft:false updated:${from}..${to}`;

async function searchPrs(token: string, kind: PrKind, scope: string, from: string, to: string, out: PrNode[]): Promise<void> {
  const q = `${scope} is:pr archived:false ${prQualifier(kind, from, to)}`;
  let after: string | null = null;
  let first = true;
  do {
    const data: PrSearch = await gql<PrSearch>(token, PR_QUERY, { q, after });
    const s = data.search;
    if (first && s.issueCount > SEARCH_CAP) {
      if (from === to) {
        console.warn(`warning: ${s.issueCount} merged PRs on ${from} for ${scope}; only the first ${SEARCH_CAP} are returned`);
      } else {
        // Bisect the date range so every sub-query stays under the cap.
        const a = new Date(from), b = new Date(to);
        const mid = day(new Date(a.getTime() + Math.floor((b.getTime() - a.getTime()) / 2 / 86_400_000) * 86_400_000));
        await searchPrs(token, kind, scope, from, mid, out);
        await searchPrs(token, kind, scope, day(addDays(new Date(mid), 1)), to, out);
        return;
      }
    }
    first = false;
    for (const n of s.nodes) if (n) out.push(n);
    after = s.pageInfo.hasNextPage ? s.pageInfo.endCursor : null;
  } while (after);
}

export async function fetchMergedPrs(cfg: Config, token: string, now = new Date()): Promise<Signal[]> {
  const from = day(addDays(now, -cfg.lookback_days));
  const to = day(now);
  const raw: PrNode[] = [];
  for (const scope of scopes(cfg)) await searchPrs(token, "merged", scope, from, to, raw);

  const exclude = new Set(cfg.github.exclude_repos);
  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const pr of raw) {
    if (!pr.mergedAt || !pr.repository) continue; // not a PR node
    if (pr.repository.isArchived || exclude.has(pr.repository.name)) continue;
    // Only merges into the default branch count as "shipped".
    if (pr.repository.defaultBranchRef?.name !== pr.baseRefName) continue;
    const labels = pr.labels.nodes.map((l) => l.name);
    if (hasConfidential(labels, cfg)) continue;
    const sig = normalizePr(pr, cfg.github.linear_id_ignore_prefixes);
    if (seen.has(sig.id)) continue;
    seen.add(sig.id);
    signals.push(sig);
  }
  return signals;
}

/**
 * Open pull requests that signal upcoming work: approved ones (=> "In review") and ones carrying a configured
 * label such as `feature-flag` or `release` (=> "In development"). Drafts and bot PRs never count.
 */
export async function fetchOpenPrs(cfg: Config, token: string, now = new Date()): Promise<Signal[]> {
  const from = day(addDays(now, -cfg.lookback_days));
  const to = day(now);
  const raw: PrNode[] = [];
  for (const scope of scopes(cfg)) await searchPrs(token, "open", scope, from, to, raw);

  const exclude = new Set(cfg.github.exclude_repos);
  const wanted = new Set(cfg.github.open_pr_labels.map((l) => l.toLowerCase()));
  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const pr of raw) {
    if (!pr.repository || pr.mergedAt || pr.isDraft) continue;
    if (pr.repository.isArchived || exclude.has(pr.repository.name)) continue;
    const labels = pr.labels.nodes.map((l) => l.name);
    if (hasConfidential(labels, cfg)) continue;
    const approved = pr.reviewDecision === "APPROVED" && pr.repository.defaultBranchRef?.name === pr.baseRefName;
    const labelled = labels.some((l) => wanted.has(l.toLowerCase()));
    if (!approved && !labelled) continue;
    const sig = normalizeOpenPr(pr, approved, cfg.github.linear_id_ignore_prefixes);
    if (seen.has(sig.id)) continue;
    seen.add(sig.id);
    signals.push(sig);
  }
  return signals;
}

// ---------- releases ----------

const REPO_SEARCH = `
query($q: String!, $after: String) {
  search(query: $q, type: REPOSITORY, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on Repository { name } }
  }
}`;

type RepoSearch = { search: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ({ name: string } | null)[] } };

async function reposToCheck(cfg: Config, token: string, since: string): Promise<string[]> {
  const { org, repos, exclude_repos } = cfg.github;
  if (repos.length) return repos;
  const names: string[] = [];
  let after: string | null = null;
  do {
    const data: RepoSearch = await gql<RepoSearch>(token, REPO_SEARCH, { q: `org:${org} archived:false pushed:>=${since}`, after });
    for (const n of data.search.nodes) if (n && !exclude_repos.includes(n.name)) names.push(n.name);
    after = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
  } while (after);
  return names;
}

type ReleaseNode = RawRelease & { isDraft: boolean };

export async function fetchReleases(cfg: Config, token: string, now = new Date()): Promise<Signal[]> {
  const sinceDate = addDays(now, -cfg.lookback_days);
  const names = await reposToCheck(cfg, token, day(sinceDate));
  const signals: Signal[] = [];

  for (let i = 0; i < names.length; i += RELEASE_BATCH) {
    const batch = names.slice(i, i + RELEASE_BATCH);
    const decl = batch.map((_, j) => `$o${j}: String!, $n${j}: String!`).join(", ");
    const body = batch
      .map(
        (_, j) => `r${j}: repository(owner: $o${j}, name: $n${j}) {
          name
          releases(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes { name tagName url description publishedAt isDraft isPrerelease author { login } }
          }
        }`,
      )
      .join("\n");
    const vars: Record<string, unknown> = {};
    batch.forEach((n, j) => ((vars[`o${j}`] = cfg.github.org), (vars[`n${j}`] = n)));

    const data = await gql<Record<string, { name: string; releases: { nodes: ReleaseNode[] } } | null>>(
      token,
      `query(${decl}) { ${body} }`,
      vars,
    );
    for (const repo of Object.values(data)) {
      if (!repo) continue;
      for (const r of repo.releases.nodes) {
        if (r.isDraft || !r.publishedAt || new Date(r.publishedAt) < sinceDate) continue;
        signals.push(normalizeRelease(repo.name, r, cfg.github.linear_id_ignore_prefixes));
      }
    }
  }
  return signals;
}

export async function fetchGithubSignals(cfg: Config, token: string): Promise<{ signals: Signal[]; sources: SourceStatus[] }> {
  const sources: SourceStatus[] = [];
  // Merged PRs are essential: a failure here aborts the refresh (the caller records it).
  const prs = await fetchMergedPrs(cfg, token);
  sources.push({ name: "github-prs", ok: true });

  // Open PRs are supplementary too: they only add the upcoming-work stages.
  let open: Signal[] = [];
  if (cfg.github.include_open_prs) {
    try {
      open = await fetchOpenPrs(cfg, token);
      sources.push({ name: "github-open-prs", ok: true });
    } catch (e) {
      sources.push({ name: "github-open-prs", ok: false, error: errMsg(e) });
    }
  }

  // Releases are supplementary: a failure degrades the refresh to "partial".
  let releases: Signal[] = [];
  if (cfg.github.include_releases) {
    try {
      releases = await fetchReleases(cfg, token);
      sources.push({ name: "github-releases", ok: true });
    } catch (e) {
      sources.push({ name: "github-releases", ok: false, error: errMsg(e) });
    }
  }
  return { signals: [...prs, ...open, ...releases].sort((a, b) => b.date.localeCompare(a.date)), sources };
}
