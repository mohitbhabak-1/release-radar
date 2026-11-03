export type Signal = {
  source: "linear_project" | "linear_issue" | "github_pr" | "github_release";
  id: string;
  title: string;
  body: string; // truncated to ~2,000 chars
  url: string;
  team?: string; // GitHub: repo name
  owner?: string;
  status: string;
  date: string; // ISO; most relevant date (target, merged, completed)
  linearIds: string[];
  labels: string[];
  /** Linear project this belongs to (the project itself, or an issue inside it). */
  projectId?: string;
  /** Pull requests this signal points at, as "repo#123" (from Linear attachments). */
  refs?: string[];
};

export type FeatureSummary = {
  isCustomerFacing: boolean;
  title: string;
  oneLiner: string;
  whyItMatters: string;
  audience: string[];
  productArea: string;
  stage: "Shipped" | "Rolling out" | "In review" | "In development" | "Planned";
  expectedDate?: string;
  confidence: "high" | "medium" | "low";
  needsAttention: { pmm: boolean; design: boolean; docs: boolean };
  owner?: string;
  links: { label: string; url: string }[];
};
