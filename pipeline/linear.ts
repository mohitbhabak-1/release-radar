import type { Config } from "./config";
import { cleanBody, truncate } from "./normalize";
import { errMsg } from "./status";
import type { Signal } from "./types";

const API = "https://api.linear.app/graphql";
const MAX_ATTEMPTS = 5;
const PAGE = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(2 ** attempt * 1000, 60_000) + Math.floor(Math.random() * 500);

export const PROJECTS_QUERY = `
query Projects($filter: ProjectFilter, $after: String) {
  projects(filter: $filter, first: ${PAGE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name description url progress targetDate startedAt completedAt updatedAt
      status { name type }
      lead { name }
      teams(first: 5) { nodes { key name } }
      labels(first: 20) { nodes { name } }
      projectUpdates(first: 2) { nodes { body health createdAt } }
      documents(first: 10) { nodes { title } }
    }
  }
}`;

export const ISSUES_QUERY = `
query Issues($filter: IssueFilter, $after: String) {
  issues(filter: $filter, first: ${PAGE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id identifier title description url priorityLabel completedAt updatedAt branchName
      state { name type }
      assignee { name }
      team { key name }
      project { id }
      cycle { number name }
      labels(first: 20) { nodes { name } }
      attachments(first: 10) { nodes { url sourceType title } }
    }
  }
}`;

type Conn<T> = { nodes: T[] };
export type RawProject = {
  id: string; name: string; description: string | null; url: string; progress: number;
  targetDate: string | null; startedAt: string | null; completedAt: string | null; updatedAt: string;
  status: { name: string; type: string };
  lead: { name: string } | null;
  teams: Conn<{ key: string; name: string }>;
  labels: Conn<{ name: string }>;
  projectUpdates: Conn<{ body: string; health: string | null; createdAt: string }>;
  documents: Conn<{ title: string }>;
};
export type RawIssue = {
  id: string; identifier: string; title: string; description: string | null; url: string; priorityLabel: string;
  completedAt: string | null; updatedAt: string; branchName: string | null;
  state: { name: string; type: string };
  assignee: { name: string } | null;
  team: { key: string; name: string };
  project: { id: string } | null;
  cycle: { number: number; name: string | null } | null;
  labels: Conn<{ name: string }>;
  attachments: Conn<{ url: string; sourceType: string | null; title: string | null }>;
};

// ---------- normalizers (pure, unit-tested) ----------

/** Canonical status strings consumed by deriveStage. */
export function projectStatus(type: string): string {
  return type === "completed" ? "Project completed" : type === "started" ? "Project started" : "Project planned";
}

export function issueStatus(state: { name: string; type: string }): string {
  if (state.type === "completed") return "Done";
  if (state.type === "started") return /review/i.test(state.name) ? "In Review" : "In Progress";
  return "Planned";
}

export function normalizeProject(p: RawProject): Signal {
  const latest = p.projectUpdates.nodes[0];
  const parts = [
    p.description?.trim(),
    latest ? `Latest update (${latest.health ?? "no health"}): ${latest.body.trim()}` : "",
    p.documents.nodes.length ? `Documents: ${p.documents.nodes.map((d) => d.title).join("; ")}` : "",
    `Progress: ${Math.round(p.progress * 100)}%`,
  ].filter(Boolean);
  return {
    source: "linear_project",
    id: `project:${p.id}`,
    title: p.name,
    body: cleanBody(parts.join("\n\n")),
    url: p.url,
    team: p.teams.nodes[0]?.key,
    owner: p.lead?.name,
    status: projectStatus(p.status.type),
    // Target date for unfinished work; completion date for finished work.
    date: (p.status.type === "completed" ? p.completedAt : p.targetDate) ?? p.updatedAt,
    linearIds: [],
    labels: p.labels.nodes.map((l) => l.name),
    projectId: p.id,
  };
}

const PR_URL = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/;

export function normalizeIssue(i: RawIssue): Signal {
  const refs = i.attachments.nodes
    .map((a) => a.url.match(PR_URL))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => `${m[1]}#${m[2]}`);
  return {
    source: "linear_issue",
    id: i.identifier,
    title: i.title,
    body: cleanBody(i.description),
    url: i.url,
    team: i.team.key,
    owner: i.assignee?.name,
    status: issueStatus(i.state),
    date: i.completedAt ?? i.updatedAt,
    linearIds: [i.identifier],
    labels: i.labels.nodes.map((l) => l.name),
    projectId: i.project?.id,
    refs: [...new Set(refs)],
  };
}

// ---------- filters ----------

export function projectFilter(cfg: Config, sinceIso: string) {
  return {
    and: [
      { accessibleTeams: { some: { key: { in: cfg.linear.teams } } } },
      {
        or: [
          { status: { type: { in: ["started", "planned"] } } },
          { status: { type: { eq: "completed" } }, completedAt: { gte: sinceIso } },
        ],
      },
    ],
  };
}

export function issueFilter(cfg: Config, sinceIso: string) {
  return {
    team: { key: { in: cfg.linear.teams } },
    labels: { some: { name: { in: cfg.linear.feature_labels } } },
    state: { name: { in: cfg.linear.include_states } },
    updatedAt: { gte: sinceIso },
  };
}

// ---------- transport ----------

type GqlBody<T> = { data?: T; errors?: { message: string; extensions?: { code?: string; type?: string } }[] };

/** Linear GraphQL call. Personal API keys go in Authorization without a "Bearer" prefix. */
export async function linearGql<T>(key: string, query: string, variables: Record<string, unknown>): Promise<T> {
  let lastErr = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      lastErr = `network error: ${e instanceof Error ? e.message : "unknown"}`;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.status === 401) throw new Error("Linear rejected the API key (401). Check LINEAR_API_KEY.");

    const body = (await res.json().catch(() => ({}))) as GqlBody<T>;
    const limited = res.status === 429 || body.errors?.some((e) => e.extensions?.code === "RATELIMITED" || e.extensions?.type === "ratelimited");
    if (limited) {
      lastErr = "rate limited";
      // X-RateLimit-Requests-Reset is a UTC epoch in milliseconds.
      const reset = Number(res.headers.get("x-ratelimit-requests-reset") ?? res.headers.get("x-ratelimit-complexity-reset"));
      const wait = reset > Date.now() ? reset - Date.now() + 500 : backoff(attempt);
      await sleep(Math.min(wait, 5 * 60_000));
      continue;
    }
    if (res.status >= 500) {
      lastErr = `HTTP ${res.status}`;
      await sleep(backoff(attempt));
      continue;
    }
    if (!res.ok || body.errors?.length) {
      throw new Error(`Linear error: ${truncate(body.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}`, 300)}`);
    }
    return body.data as T;
  }
  throw new Error(`Linear request failed after ${MAX_ATTEMPTS} attempts (${lastErr})`);
}

async function paginate<N>(key: string, query: string, field: "projects" | "issues", filter: unknown): Promise<N[]> {
  const out: N[] = [];
  let after: string | null = null;
  do {
    const data: Record<string, { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: N[] }> = await linearGql(key, query, { filter, after });
    out.push(...data[field].nodes);
    after = data[field].pageInfo.hasNextPage ? data[field].pageInfo.endCursor : null;
  } while (after);
  return out;
}

export type LinearResult = { signals: Signal[]; confidentialIds: Set<string>; confidentialProjects: Set<string> };

export async function fetchLinearSignals(cfg: Config, key: string, now = new Date()): Promise<LinearResult> {
  const { teams, feature_labels, confidential_labels } = cfg.linear;
  if (!teams.length) throw new Error("linear.teams is empty in config.yaml");
  const since = new Date(now.getTime() - cfg.lookback_days * 86_400_000).toISOString();
  const horizon = now.getTime() + cfg.lookahead_days * 86_400_000;
  const deny = new Set(confidential_labels.map((l) => l.toLowerCase()));
  const isConfidential = (labels: string[]) => labels.some((l) => deny.has(l.toLowerCase()));

  const projects = await paginate<RawProject>(key, PROJECTS_QUERY, "projects", projectFilter(cfg, since));
  // Issues are only queried when feature labels are configured; without them every issue would qualify.
  const issues = feature_labels.length
    ? await paginate<RawIssue>(key, ISSUES_QUERY, "issues", issueFilter(cfg, since))
    : [];

  const confidentialProjects = new Set<string>();
  const confidentialIds = new Set<string>();
  const signals: Signal[] = [];

  for (const p of projects) {
    const labels = p.labels.nodes.map((l) => l.name);
    if (isConfidential(labels)) { confidentialProjects.add(p.id); continue; }
    // Planned work only matters when its target date falls inside the look-ahead window (or is undated).
    if (p.status.type === "planned" && p.targetDate && new Date(p.targetDate).getTime() > horizon) continue;
    signals.push(normalizeProject(p));
  }
  for (const i of issues) {
    const labels = i.labels.nodes.map((l) => l.name);
    if (isConfidential(labels) || (i.project && confidentialProjects.has(i.project.id))) { confidentialIds.add(i.identifier); continue; }
    signals.push(normalizeIssue(i));
  }
  return { signals, confidentialIds, confidentialProjects };
}

/** GitHub signals that reference a confidential Linear ticket must not appear either. */
export function dropConfidentialLinks(signals: Signal[], confidentialIds: Set<string>): Signal[] {
  if (!confidentialIds.size) return signals;
  return signals.filter((s) => !s.linearIds.some((id) => confidentialIds.has(id)));
}

export { errMsg };
