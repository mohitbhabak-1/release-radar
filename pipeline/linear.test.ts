import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveStage } from "./stage";
import { groupSignals } from "./group";
import { dropConfidentialLinks, issueStatus, linearGql, normalizeIssue, normalizeProject, projectStatus, type RawIssue, type RawProject } from "./linear";
import type { Signal } from "./types";

const project: RawProject = {
  id: "p-1234567890", name: "Staking dashboard", description: "Show rewards per validator", url: "https://linear.app/x/project/p",
  progress: 0.4, targetDate: "2026-12-01", startedAt: "2026-10-01", completedAt: null, updatedAt: "2026-11-01T00:00:00Z",
  status: { name: "In Progress", type: "started" }, lead: { name: "Dana" },
  teams: { nodes: [{ key: "STK", name: "Staking" }] }, labels: { nodes: [{ name: "launch" }] },
  projectUpdates: { nodes: [{ body: "Beta next week", health: "onTrack", createdAt: "2026-10-30" }] },
  documents: { nodes: [{ title: "PRD" }] },
};
const issue: RawIssue = {
  id: "i-1", identifier: "STK-12", title: "Rewards table", description: "desc", url: "https://linear.app/x/issue/STK-12",
  priorityLabel: "High", completedAt: null, updatedAt: "2026-11-01T00:00:00Z", branchName: "dana/stk-12-rewards",
  state: { name: "In Review", type: "started" }, assignee: { name: "Eli" }, team: { key: "STK", name: "Staking" },
  project: { id: "p-1234567890" }, cycle: { number: 4, name: null }, labels: { nodes: [{ name: "feature" }] },
  attachments: { nodes: [{ url: "https://github.com/BitGo/BitGoJS/pull/777", sourceType: "github", title: "PR" }, { url: "https://example.com", sourceType: null, title: null }] },
};

describe("Linear normalizers", () => {
  it("maps a project", () => {
    const s = normalizeProject(project);
    expect(s).toMatchObject({ source: "linear_project", title: "Staking dashboard", owner: "Dana", team: "STK", status: "Project started", date: "2026-12-01", projectId: "p-1234567890" });
    expect(s.body).toContain("Beta next week");
    expect(s.body).toContain("PRD");
    expect(s.body).toContain("40%");
  });
  it("uses the completion date for finished projects", () => {
    expect(normalizeProject({ ...project, status: { name: "Done", type: "completed" }, completedAt: "2026-10-20T00:00:00Z" }).date).toBe("2026-10-20T00:00:00Z");
  });
  it("maps an issue and extracts GitHub PR links", () => {
    const s = normalizeIssue(issue);
    expect(s).toMatchObject({ id: "STK-12", linearIds: ["STK-12"], status: "In Review", owner: "Eli", projectId: "p-1234567890", refs: ["BitGoJS#777"] });
  });
  it("maps statuses", () => {
    expect(issueStatus({ name: "Done", type: "completed" })).toBe("Done");
    expect(issueStatus({ name: "In Progress", type: "started" })).toBe("In Progress");
    expect(issueStatus({ name: "Todo", type: "unstarted" })).toBe("Planned");
    expect(projectStatus("planned")).toBe("Project planned");
  });
});

const pr = (o: Partial<Signal> & { id: string }): Signal => ({
  source: "github_pr", title: "feat: x", body: "", url: "u", team: "BitGoJS", status: "Merged", date: "2026-10-30T00:00:00Z", linearIds: [], labels: [], ...o,
});

describe("grouping with Linear", () => {
  it("anchors a group on the project and pulls in its issues and attached PRs", () => {
    const groups = groupSignals([
      normalizeProject(project),
      normalizeIssue(issue),
      pr({ id: "BitGoJS#777", title: "feat: rewards table" }), // linked only via the Linear attachment
      pr({ id: "BitGoJS#1", title: "feat: unrelated" }),
    ]);
    const g = groups.find((x) => x.kind === "project")!;
    expect(g.signals.map((s) => s.id).sort()).toEqual(["BitGoJS#777", "STK-12", `project:p-1234567890`].sort());
    expect(g.confidence).toBe("high");
    expect(g.targetDate).toBe("2026-12-01");
    expect(groups).toHaveLength(2);
  });
});

describe("deriveStage with Linear", () => {
  const st = (...status: string[]) => deriveStage(status.map((x) => ({ ...pr({ id: x }), status: x })));
  it("started project with nothing merged is in development", () => expect(st("Project started")).toBe("In development"));
  it("started project with an approved PR is in review", () => expect(st("Project started", "Approved")).toBe("In review"));
  it("started project with merged work is rolling out", () => expect(st("Project started", "Merged")).toBe("Rolling out"));
  it("planned project is planned", () => expect(st("Project planned")).toBe("Planned"));
  it("completed project is shipped", () => expect(st("Project completed")).toBe("Shipped"));
  it("done issues ship", () => expect(st("Done")).toBe("Shipped"));
});

describe("confidential links", () => {
  it("drops GitHub work that references a confidential ticket", () => {
    const kept = dropConfidentialLinks([pr({ id: "a", linearIds: ["SEC-1"] }), pr({ id: "b", linearIds: ["WAL-2"] })], new Set(["SEC-1"]));
    expect(kept.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("linearGql", () => {
  afterEach(() => vi.restoreAllMocks());
  it("sends the key without a Bearer prefix and returns data", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { ok: 1 } }), { status: 200 }));
    expect(await linearGql("lin_api_x", "query{x}", {})).toEqual({ ok: 1 });
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "lin_api_x" });
  });
  it("retries after a rate limit then succeeds", async () => {
    vi.useFakeTimers();
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: "slow down", extensions: { code: "RATELIMITED" } }] }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: 2 } }), { status: 200 }));
    const p = linearGql("k", "q", {});
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ ok: 2 });
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it("fails clearly on a bad key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(linearGql("bad", "q", {})).rejects.toThrow(/LINEAR_API_KEY/);
  });
});
