import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS } from "./filters";
import type { FeatureRecord } from "./releases";

const f = (o: Partial<FeatureRecord> & { id: string }): FeatureRecord => ({
  groupKind: "pr", isCustomerFacing: true, title: o.id, oneLiner: "", whyItMatters: "", audience: [], productArea: "Wallets",
  stage: "Shipped", confidence: "high", needsAttention: { pmm: false, design: false, docs: false }, repos: ["BitGoJS"],
  linearIds: [], links: [], signals: [], expectedDate: "2026-10-30", ...o,
});

const data = [
  f({ id: "a", title: "Staking dashboard", productArea: "Staking", needsAttention: { pmm: true, design: true, docs: false } }),
  f({ id: "b", title: "Wallet recovery", expectedDate: "2026-11-01", repos: ["BitGoWASM"] }),
  f({ id: "c", title: "Internal tooling", isCustomerFacing: false }),
  f({ id: "d", title: "Maybe a thing", confidence: "low" }),
];

describe("applyFilters", () => {
  it("hides non-customer-facing and low-confidence by default, newest first", () => {
    expect(applyFilters(data, DEFAULT_FILTERS).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("showAll reveals everything", () => {
    expect(applyFilters(data, { ...DEFAULT_FILTERS, showAll: true })).toHaveLength(4);
  });
  it("filters by area, repo and needs flags", () => {
    expect(applyFilters(data, { ...DEFAULT_FILTERS, area: "Staking" }).map((x) => x.id)).toEqual(["a"]);
    expect(applyFilters(data, { ...DEFAULT_FILTERS, repo: "BitGoWASM" }).map((x) => x.id)).toEqual(["b"]);
    expect(applyFilters(data, { ...DEFAULT_FILTERS, pmm: true, design: true }).map((x) => x.id)).toEqual(["a"]);
  });
  it("searches all terms case-insensitively", () => {
    expect(applyFilters(data, { ...DEFAULT_FILTERS, query: "WALLET recovery" }).map((x) => x.id)).toEqual(["b"]);
    expect(applyFilters(data, { ...DEFAULT_FILTERS, query: "nothing matches" })).toEqual([]);
  });
});
