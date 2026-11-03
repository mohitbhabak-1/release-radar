import { STAGES, STAGE_HEADINGS, formatDate, type ReleasesFile } from "./releases";

/** Plain text for pasting into Slack or email. Customer-facing, non-low-confidence items only. */
export function digestText(data: ReleasesFile): string {
  const lines: string[] = [];
  lines.push(`Release Radar: last ${data.lookbackDays} days`);
  if (data.digest?.bullets.length) {
    lines.push("", "This week at a glance");
    for (const b of data.digest.bullets) lines.push(`• ${b}`);
  }
  const shown = data.features.filter((f) => f.isCustomerFacing && f.confidence !== "low");
  for (const stage of STAGES) {
    const items = shown.filter((f) => f.stage === stage).sort((a, b) => (b.expectedDate ?? "").localeCompare(a.expectedDate ?? ""));
    if (!items.length) continue;
    lines.push("", `${STAGE_HEADINGS[stage]} (${items.length})`);
    for (const f of items) {
      const meta = [f.productArea, formatDate(f.expectedDate)].filter(Boolean).join(", ");
      const flags = (["pmm", "design", "docs"] as const).filter((k) => f.needsAttention[k]).map((k) => (k === "pmm" ? "PMM" : k === "design" ? "Design" : "Docs"));
      lines.push(`• ${f.title} (${meta}): ${f.oneLiner}${flags.length ? ` [needs: ${flags.join(", ")}]` : ""}`);
    }
  }
  if (lines.length === 1) lines.push("", "No release data yet.");
  return lines.join("\n");
}
