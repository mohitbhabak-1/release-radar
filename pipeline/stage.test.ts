import { describe, expect, it } from "vitest";
import { deriveStage, resolveStage } from "./stage";
import type { Signal } from "./types";

const s = (status: string): Signal => ({ source: "github_pr", id: "r#1", title: "t", body: "", url: "u", status, date: "", linearIds: [], labels: [] });

describe("deriveStage", () => {
  it.each([
    [["Merged"], "Shipped"],
    [["Released"], "Shipped"],
    [["Pre-release"], "Rolling out"],
    [["Pre-release", "Merged"], "Shipped"],
    [["Merged", "Approved"], "Rolling out"],
    [["Merged", "Open"], "Rolling out"],
    [["Approved"], "In review"],
    [["In Progress"], "In development"],
    [["Open"], "In development"],
    [["Backlog"], "Planned"],
  ])("%j -> %s", (statuses, expected) => {
    expect(deriveStage(statuses.map(s))).toBe(expected);
  });
});

describe("resolveStage", () => {
  it("keeps derived stage without an override", () => expect(resolveStage("Shipped").stage).toBe("Shipped"));
  it("allows Shipped -> Rolling out with a reason", () => {
    expect(resolveStage("Shipped", { stage: "Rolling out", reason: "Merged behind a feature flag" })).toEqual({ stage: "Rolling out", overridden: true });
  });
  it("rejects overrides without a real reason", () => {
    expect(resolveStage("Shipped", { stage: "Rolling out", reason: "flag" }).overridden).toBe(false);
  });
  it("never un-ships merged work", () => {
    expect(resolveStage("Shipped", { stage: "In development", reason: "Looks unfinished to me" }).stage).toBe("Shipped");
  });
});
