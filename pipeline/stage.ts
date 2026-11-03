import type { Signal } from "./types";

export type Stage = "Shipped" | "Rolling out" | "In review" | "In development" | "Planned";

/** Stage comes from evidence in code. The LLM may only override via `resolveStage` rules. */
export function deriveStage(signals: Signal[]): Stage {
  const has = (...st: string[]) => signals.some((s) => st.includes(s.status));
  const shipped = has("Merged", "Released", "Done", "Project completed");
  const inReview = has("Approved", "In Review");
  const inDev = has("Open", "In Progress");

  // A started Linear project is unfinished work, even if some of its pull requests have merged.
  if (has("Project started")) return shipped || has("Pre-release") ? "Rolling out" : inReview ? "In review" : "In development";
  if (has("Project planned") && !shipped) return "Planned";

  if (shipped && (inReview || inDev)) return "Rolling out"; // part has merged, more is still open
  if (shipped) return "Shipped";
  if (has("Pre-release")) return "Rolling out";
  if (inReview) return "In review";
  if (inDev) return "In development";
  return "Planned";
}

export type StageOverride = { stage: Stage; reason: string };

/**
 * An override needs a real reason, and evidence of shipping can only be softened to "Rolling out"
 * (e.g. merged behind a flag). Anything else is ignored.
 */
export function resolveStage(derived: Stage, override?: StageOverride | null): { stage: Stage; overridden: boolean } {
  if (!override || override.stage === derived || override.reason.trim().length < 10) return { stage: derived, overridden: false };
  if (derived === "Shipped" && override.stage !== "Rolling out") return { stage: derived, overridden: false };
  return { stage: override.stage, overridden: true };
}
