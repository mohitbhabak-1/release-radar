import { describe, expect, it } from "vitest";
import { cleanBody, extractLinearIdFromBranch, extractLinearIds, normalizePr, normalizeRelease, MAX_BODY_CHARS } from "./normalize";

describe("extractLinearIds", () => {
  it("finds IDs in title, body and branch, deduped and sorted", () => {
    const ids = extractLinearIds(["feat: staking (WAL-12)", "Fixes ACT-7 and WAL-12", "mohit/wal-99-thing"]);
    expect(ids).toEqual(["ACT-7", "WAL-12"]); // branches go through extractLinearIdFromBranch
  });
  it("reads Linear-style branch names", () => {
    expect(extractLinearIdFromBranch("mohit/wal-99-new-flow")).toEqual(["WAL-99"]);
    expect(extractLinearIdFromBranch("WAL-5-fix")).toEqual(["WAL-5"]);
    expect(extractLinearIdFromBranch("fix-bug-12")).toEqual([]);
    expect(extractLinearIdFromBranch("alice/utf-8-support")).toEqual([]);
  });
  it("ignores non-ticket lookalikes", () => {
    expect(extractLinearIds(["UTF-8 SHA-256 BIP-32 EIP-1559 CVE-2024-1234"])).toEqual([]);
  });
  it("rejects regex-class artifacts like Z0-9", () => {
    expect(extractLinearIds(["use [A-Z0-9] and Z0-9"])).toEqual([]);
  });
  it("honours configured ignore prefixes", () => {
    expect(extractLinearIds(["ABC-1 XYZ-2"], ["xyz"])).toEqual(["ABC-1"]);
  });
  it("handles empty input", () => {
    expect(extractLinearIds([null, undefined, ""])).toEqual([]);
  });
});

describe("cleanBody", () => {
  it("strips HTML comments and truncates", () => {
    expect(cleanBody("<!-- template -->\nHello")).toBe("Hello");
    const long = cleanBody("a".repeat(5000));
    expect(long.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
    expect(long.endsWith("…")).toBe(true);
  });
  it("handles null", () => expect(cleanBody(null)).toBe(""));
});

describe("normalizers", () => {
  it("maps a PR to a Signal", () => {
    const s = normalizePr({
      number: 5, title: "Add staking UI", body: "Closes WAL-3", url: "https://github.com/BitGo/x/pull/5",
      mergedAt: "2026-10-30T12:00:00Z", headRefName: "feat/x", author: { login: "alice" },
      labels: { nodes: [{ name: "feature" }] }, repository: { name: "x" },
    });
    expect(s).toMatchObject({ source: "github_pr", id: "x#5", team: "x", owner: "alice", status: "Merged", linearIds: ["WAL-3"], labels: ["feature"] });
  });
  it("maps a release, falling back to the tag name", () => {
    const s = normalizeRelease("x", {
      name: "", tagName: "v1.2.0", url: "u", description: "notes", publishedAt: "2026-10-30T00:00:00Z",
      isPrerelease: true, author: null,
    });
    expect(s).toMatchObject({ source: "github_release", id: "x@v1.2.0", title: "v1.2.0", status: "Pre-release" });
  });
});
