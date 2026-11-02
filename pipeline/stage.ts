import type { Signal } from "./types";

export type Stage = "Shipped" | "Rolling out" | "In review" | "In development" | "Planned";

/** Stage comes from evidence in code. The LLM may only override via `resolveStage` rules. */
export function deriveStage(signals: Signal[]): Stage {
  const shipped = signals.some((s) => s.status === "Merged" || s.status === "Released");
  if (shipped) return "Shipped";
  if (signals.some((s) => s.status === "Pre-release")) return "Rolling out";
  if (signals.some((s) => s.status === "Approved" || s.status === "In Review")) return "In review";
  if (signals.some((s) => s.status === "Open" || s.status === "In Progress")) return "In development";
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
