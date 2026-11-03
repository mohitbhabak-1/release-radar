import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeStatus, recordFailure, scrub } from "./status";

describe("computeStatus", () => {
  it("is ok when every source is ok", () => {
    expect(computeStatus([{ name: "a", ok: true }]).status).toBe("ok");
  });
  it("is partial, with a message, when a source failed", () => {
    const s = computeStatus([{ name: "a", ok: true }, { name: "github-releases", ok: false, error: "boom" }]);
    expect(s.status).toBe("partial");
    expect(s.message).toBe("github-releases: boom");
  });
});

describe("scrub", () => {
  it("removes secrets and caps length", () => {
    const out = scrub(`failed with ghp_${"a".repeat(36)} and ${"x".repeat(500)}`);
    expect(out).not.toContain("ghp_");
    expect(out.length).toBeLessThanOrEqual(300);
  });
});

describe("recordFailure", () => {
  it("keeps features and flags the file as failed", () => {
    const path = join(mkdtempSync(join(tmpdir(), "rr-")), "releases.json");
    writeFileSync(path, JSON.stringify({ generatedAt: "2026-11-02T00:00:00Z", features: [{ id: "a" }], refresh: { status: "ok", sources: [] } }));
    expect(recordFailure("token rejected", path)).toBe(true);
    const out = JSON.parse(readFileSync(path, "utf8"));
    expect(out.refresh).toMatchObject({ status: "failed", message: "token rejected" });
    expect(out.features).toHaveLength(1);
    expect(out.generatedAt).toBe("2026-11-02T00:00:00Z"); // last good refresh time is preserved
  });
  it("returns false when there is nothing to annotate", () => {
    expect(recordFailure("x", join(tmpdir(), "does-not-exist.json"))).toBe(false);
  });
});
