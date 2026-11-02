import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { conventionalScope, conventionalType, filterSignals, isVersionBumpOnly } from "./filter";
import { groupSignals, normalizeTitle } from "./group";
import type { Signal } from "./types";

const sig = (o: Partial<Signal> & { id: string; title: string }): Signal => ({
  source: "github_pr", body: "", url: `https://x/${o.id}`, team: "repo", owner: "alice", status: "Merged",
  date: "2026-10-30T00:00:00Z", linearIds: [], labels: [], ...o,
});

const cfg = loadConfig();

describe("conventionalType", () => {
  it("parses types", () => {
    expect(conventionalType("feat(statics): add x")).toBe("feat");
    expect(conventionalType("fix!: y")).toBe("fix");
    expect(conventionalType("Add a thing")).toBeUndefined();
  });
});

describe("filterSignals (chore filtering)", () => {
  const titles = [
    "chore(root): publish modules", "fix(deps): bump joi", "refactor: tidy", "ci: pin action", "Update API reference on BitGo Developer Portal",
    "feat: add staking", "Build a better wallet view", "fix(scripts): beta publish",
  ];
  const { kept, dropped } = filterSignals(titles.map((t, i) => sig({ id: `r#${i}`, title: t })), cfg);
  it("drops chores, deps, ci, internal scopes and bot PRs", () => {
    expect(dropped.map((d) => d.title)).toEqual([
      "chore(root): publish modules", "fix(deps): bump joi", "refactor: tidy", "ci: pin action",
      "Update API reference on BitGo Developer Portal", "fix(scripts): beta publish",
    ]);
  });
  it("keeps real features, including titles that merely start with 'Build'", () => {
    expect(kept.map((k) => k.title)).toEqual(["feat: add staking", "Build a better wallet view"]);
  });
  it("drops bot authors and excluded labels", () => {
    const r = filterSignals([sig({ id: "a", title: "feat: x", owner: "dependabot[bot]" }), sig({ id: "b", title: "feat: y", labels: ["Chore"] })], cfg);
    expect(r.dropped.map((d) => d.reason)).toEqual(["author: dependabot[bot]", "label: Chore"]);
  });
});

describe("groupSignals", () => {
  it("groups PRs that share a Linear ID, transitively", () => {
    const g = groupSignals([
      sig({ id: "a#1", title: "feat: part 1", linearIds: ["WAL-1"] }),
      sig({ id: "a#2", title: "feat: part 2", linearIds: ["WAL-1", "WAL-2"] }),
      sig({ id: "b#3", title: "fix: other", linearIds: ["WAL-2"], team: "b" }),
      sig({ id: "a#4", title: "feat: unrelated", linearIds: ["ACT-9"] }),
    ]);
    expect(g).toHaveLength(2);
    const big = g.find((x) => x.signals.length === 3)!;
    expect(big.linearIds).toEqual(["WAL-1", "WAL-2"]);
    expect(big.kind).toBe("ticket");
    expect(big.confidence).toBe("high");
  });
  it("clusters repeated untitled-ticket PRs in the same repo only", () => {
    const g = groupSignals([
      sig({ id: "r#1", title: "feat: PR from asset-metadata-service for token onboardings" }),
      sig({ id: "r#2", title: "feat: PR from asset-metadata-service for token onboardings" }),
      sig({ id: "o#3", title: "feat: PR from asset-metadata-service for token onboardings", team: "other" }),
    ]);
    expect(g.map((x) => [x.kind, x.signals.length]).sort()).toEqual([["cluster", 2], ["pr", 1]]);
  });
  it("attaches a release to the PRs it mentions instead of making it a feature", () => {
    const g = groupSignals([
      sig({ id: "repo#10", title: "feat: thing" }),
      sig({ id: "repo@v1", source: "github_release", title: "v1", body: "* feat: thing (#10)", status: "Released" }),
      sig({ id: "repo@v0", source: "github_release", title: "v0", body: "nothing linked" }),
    ]);
    const feat = g.find((x) => x.kind === "pr")!;
    expect(feat.shippedIn.map((s) => s.id)).toEqual(["repo@v1"]);
    expect(g.filter((x) => x.kind === "release").map((x) => x.signals[0].id)).toEqual(["repo@v0"]);
    expect(g.find((x) => x.kind === "release")!.confidence).toBe("low");
  });
  it("normalizes titles for clustering", () => {
    expect(normalizeTitle("Fix thing (#123) 4.5")).toBe("fix thing .");
  });
});

describe("version-bump releases", () => {
  it("detects package-bump-only notes", () => {
    expect(isVersionBumpOnly("@bitgo/abstract-eth: 25.5.3 -> 25.5.4\n@bitgo/sdk-api: 3.1.5 -> 3.1.6")).toBe(true);
    expect(isVersionBumpOnly("Adds staking\n@bitgo/sdk-api: 3.1.5 -> 3.1.6")).toBe(false);
    expect(isVersionBumpOnly("")).toBe(false);
    expect(isVersionBumpOnly("@bitgo/a: 1.0.0 -> 1.0.1\n@bitgo/sdk-coin-a…")).toBe(true); // truncated tail
  });
  it("drops such releases in filterSignals", () => {
    const rel = sig({ id: "r@v1", source: "github_release", title: "v1", body: "@bitgo/x: 1.0.0 -> 1.0.1" });
    expect(filterSignals([rel], cfg).dropped[0].reason).toMatch(/version bumps/);
  });
  it("parses scopes", () => expect(conventionalScope("feat(wasm-utxo)!: x")).toBe("wasm-utxo"));
});

describe("rollups", () => {
  it("merges groups matching a rule into one card", () => {
    const g = groupSignals(
      [
        sig({ id: "a#1", title: "feat(zec): Ironwood spend", linearIds: ["CSHLD-1"] }),
        sig({ id: "a#2", title: "feat(wasm-utxo): ironwood helpers", linearIds: ["CSHLD-2"], date: "2026-10-31T00:00:00Z" }),
        sig({ id: "a#3", title: "feat: unrelated", linearIds: ["X1-3"] }),
      ],
      [{ name: "Zcash Ironwood", pattern: "ironwood" }],
    );
    const r = g.find((x) => x.kind === "rollup")!;
    expect(r.title).toBe("Zcash Ironwood");
    expect(r.signals).toHaveLength(2);
    expect(r.linearIds).toEqual(["CSHLD-1", "CSHLD-2"]);
    expect(g).toHaveLength(2);
  });
});
