import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { redact } from "./redact";

export type SourceStatus = { name: string; ok: boolean; error?: string };
export type RefreshStatus = {
  status: "ok" | "partial" | "failed";
  lastAttemptAt: string;
  sources: SourceStatus[];
  message?: string;
};

/** Error text ends up in a committed file and a public issue, so strip anything secret-shaped and cap length. */
export function scrub(message: string): string {
  return redact(message).replace(/\s+/g, " ").slice(0, 300);
}

export const errMsg = (e: unknown) => scrub(e instanceof Error ? e.message : "Unknown error");

export function computeStatus(sources: SourceStatus[], now = new Date()): RefreshStatus {
  const bad = sources.filter((s) => !s.ok);
  return {
    status: bad.length ? "partial" : "ok",
    lastAttemptAt: now.toISOString(),
    sources,
    message: bad.length ? bad.map((s) => `${s.name}: ${s.error ?? "failed"}`).join("; ") : undefined,
  };
}

/**
 * On a fatal failure, keep the last good data on the page but flag it as failed so the header shows red.
 * Returns false when there is no previous file to annotate.
 */
export function recordFailure(error: string, path = "data/releases.json", now = new Date()): boolean {
  if (!existsSync(path)) return false;
  try {
    const prev = JSON.parse(readFileSync(path, "utf8"));
    prev.refresh = {
      status: "failed",
      lastAttemptAt: now.toISOString(),
      sources: prev.refresh?.sources ?? [],
      message: error,
    } satisfies RefreshStatus;
    writeFileSync(path, JSON.stringify(prev, null, 2));
    return true;
  } catch {
    return false;
  }
}
