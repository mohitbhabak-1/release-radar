import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig, missingEnv } from "./config";
import { fetchGithubSignals } from "./github";
import { dropConfidentialLinks, fetchLinearSignals } from "./linear";
import { conventionalScope, filterSignals } from "./filter";
import { groupSignals, type FeatureGroup } from "./group";
import { usage } from "./llm";
import { computeStatus, errMsg, recordFailure, type SourceStatus } from "./status";
import { buildDigest, saveCache, summarizeGroups } from "./summarize";
import type { Signal } from "./types";

const FROM_CACHE = process.argv.includes("--from-cache");
const NO_LLM = process.argv.includes("--no-llm");
const MAX_LLM = process.argv.find((a) => a.startsWith("--max-llm="))?.split("=")[1];

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
  const missing = FROM_CACHE ? [] : missingEnv(cfg, process.env, !NO_LLM);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")} (see .env.example)`);
    process.exit(1);
  }

  let signals: Signal[];
  const sources: SourceStatus[] = [];
  if (FROM_CACHE && existsSync(".cache/signals.json")) {
    signals = JSON.parse(readFileSync(".cache/signals.json", "utf8"));
    console.log(`Using ${signals.length} cached signals (--from-cache)`);
  } else {
    const scope = cfg.github.repos.length
      ? `${cfg.github.repos.length} listed repos`
      : `all non-archived repos in ${cfg.github.org}`;
    console.log(`Release Radar refresh: lookback ${cfg.lookback_days}d, GitHub scope = ${scope}`);
    const gh = await fetchGithubSignals(cfg, process.env.GITHUB_TOKEN!);
    signals = gh.signals;
    sources.push(...gh.sources);

    if (cfg.linear.enabled) {
      // Linear is supplementary for now: if it fails the page still gets the GitHub picture, flagged amber.
      try {
        const lin = await fetchLinearSignals(cfg, process.env.LINEAR_API_KEY!);
        signals = [...dropConfidentialLinks(signals, lin.confidentialIds), ...lin.signals];
        sources.push({ name: "linear", ok: true });
      } catch (e) {
        sources.push({ name: "linear", ok: false, error: errMsg(e) });
      }
    }
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
  console.log("\nWrote data/features.raw.json");
  if (NO_LLM) return;

  const { records, stats, cache } = await summarizeGroups(cfg, groups, { maxLlm: MAX_LLM ? Number(MAX_LLM) : undefined });
  // Guard against a silently degraded source (e.g. a token that can only see some repos) wiping good data.
  const prevCount = existsSync("data/releases.json") ? (JSON.parse(readFileSync("data/releases.json", "utf8")).features?.length ?? 0) : 0;
  if (!process.env.ALLOW_SHRINK && prevCount >= 10 && records.length < prevCount * 0.3) {
    throw new Error(`Refresh produced only ${records.length} features vs ${prevCount} before (only ${signals.length} signals fetched). Keeping the previous data. Set ALLOW_SHRINK=1 to accept a genuinely quiet period.`);
  }
  if (!records.length && groups.length) throw new Error(`No summaries were produced (${stats.errors[0] ?? "unknown LLM error"})`);
  sources.push({ name: "llm-summaries", ok: !stats.failed && !stats.errors.length, error: stats.errors[0] });

  let digest: Awaited<ReturnType<typeof buildDigest>>;
  try {
    digest = await buildDigest(cfg, records, cache);
    sources.push({ name: "llm-digest", ok: true });
  } catch (e) {
    // Reuse the previous digest text rather than showing an empty block.
    const prev = existsSync("data/releases.json") ? JSON.parse(readFileSync("data/releases.json", "utf8")).digest : undefined;
    digest = prev ?? { bullets: [], countsByStage: {} };
    sources.push({ name: "llm-digest", ok: false, error: errMsg(e) });
  }
  saveCache(cache);

  writeFileSync(
    "data/releases.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        lookbackDays: cfg.lookback_days,
        refresh: computeStatus(sources),
        areas: cfg.product_areas.map((a) => a.name),
        scanned: { org: cfg.github.org, repos: [...new Set(groups.flatMap((g) => g.repos))].sort() },
        digest,
        features: records,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nSummaries: ${stats.cacheHits} from cache, ${stats.llmFeatures} summarized by LLM` +
      (stats.skipped ? `, ${stats.skipped} skipped (--max-llm)` : "") +
      ` | LLM calls: ${usage.calls}, tokens in/out: ${usage.promptTokens}/${usage.completionTokens}`,
  );
  const status = computeStatus(sources);
  if (status.status !== "ok") console.log(`::warning::Release Radar refresh is ${status.status}: ${status.message}`);
  console.log(`Customer-facing: ${records.filter((r) => r.isCustomerFacing).length}/${records.length}. Wrote data/releases.json`);
}

main().catch((err) => {
  // Log the scrubbed message only: never dump request objects, which could carry auth headers.
  const msg = errMsg(err);
  console.error(`Refresh failed: ${msg}`);
  if (!FROM_CACHE && !NO_LLM) recordFailure(msg); // keep last good data, but flag it red on the page
  process.exit(1);
});
