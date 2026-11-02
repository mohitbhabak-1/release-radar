import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig, missingEnv } from "./config";
import { fetchGithubSignals } from "./github";
import { conventionalScope, filterSignals } from "./filter";
import { groupSignals, type FeatureGroup } from "./group";
import type { Signal } from "./types";

const FROM_CACHE = process.argv.includes("--from-cache");

const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 30);

function reviewGroups(groups: FeatureGroup[], dropped: { reason: string }[], total: number) {
  const reasons = new Map<string, number>();
  for (const d of dropped) {
    const r = d.reason.replace(/^title matches .*/, "title pattern");
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  console.log(`\n${total} signals -> dropped ${dropped.length} as chores, ${total - dropped.length} kept -> ${groups.length} feature groups`);
  console.log("Dropped by reason:", [...reasons].map(([r, n]) => `${r} (${n})`).join(", ") || "none");
  const by = (c: string) => groups.filter((g) => g.confidence === c).length;
  console.log(`Confidence: high ${by("high")}, medium ${by("medium")}, low ${by("low")}; with a feat/feature signal: ${groups.filter((g) => g.hasFeatureSignal).length}`);
  const scopes = new Map<string, number>();
  for (const g of groups.filter((g) => g.kind !== "rollup"))
    for (const sc of new Set(g.signals.map((s) => conventionalScope(s.title)).filter(Boolean) as string[]))
      scopes.set(sc, (scopes.get(sc) ?? 0) + 1);
  const hints = [...scopes].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (hints.length) console.log("Roll-up candidates (commit scopes spread over many groups):", hints.map(([s, n]) => `${s} (${n})`).join(", "));
  console.log(`\nGroups (most recent ${Math.min(LIMIT, groups.length)}):`);
  for (const g of groups.slice(0, LIMIT)) {
    const ids = g.linearIds.length ? ` [${g.linearIds.slice(0, 3).join(",")}${g.linearIds.length > 3 ? ",…" : ""}]` : "";
    console.log(`${g.latestDate.slice(0, 10)}  ${g.confidence.padEnd(6)} ${g.kind.padEnd(7)} x${g.signals.length}  ${g.repos.join("+")}  ${g.title.slice(0, 80)}${ids}`);
  }
}

async function main() {
  const cfg = loadConfig();
  const missing = FROM_CACHE ? [] : missingEnv(cfg);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")} (see .env.example)`);
    process.exit(1);
  }

  let signals: Signal[];
  if (FROM_CACHE && existsSync(".cache/signals.json")) {
    signals = JSON.parse(readFileSync(".cache/signals.json", "utf8"));
    console.log(`Using ${signals.length} cached signals (--from-cache)`);
  } else {
    const scope = cfg.github.repos.length
      ? `${cfg.github.repos.length} listed repos`
      : `all non-archived repos in ${cfg.github.org}`;
    console.log(`Release Radar refresh: lookback ${cfg.lookback_days}d, GitHub scope = ${scope}`);
    signals = await fetchGithubSignals(cfg, process.env.GITHUB_TOKEN!);
    // Local scratch output (gitignored). Contains truncated PR bodies, so keep it out of git.
    mkdirSync(".cache", { recursive: true });
    writeFileSync(".cache/signals.json", JSON.stringify(signals, null, 2));
  }

  const { kept, dropped } = filterSignals(signals, cfg);
  const groups = groupSignals(kept, cfg.rollups);
  reviewGroups(groups, dropped, signals.length);

  mkdirSync("data", { recursive: true });
  writeFileSync(
    "data/features.raw.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), lookbackDays: cfg.lookback_days, dropped, groups }, null, 2),
  );
  console.log("\nWrote data/features.raw.json (no LLM calls made)");
}

main().catch((err) => {
  // Log message only: never dump request objects, which could carry auth headers.
  console.error(err instanceof Error ? err.message : "Unknown error");
  process.exit(1);
});
