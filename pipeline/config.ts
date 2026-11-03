import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const AreaSchema = z.union([
  z.string().transform((name) => ({ name, description: "" })),
  z.object({ name: z.string().min(1), description: z.string().default("") }),
]);

const ConfigSchema = z.object({
  lookback_days: z.number().int().positive(),
  lookahead_days: z.number().int().nonnegative(),
  github: z.object({
    org: z.string().min(1),
    repos: z.array(z.string()).default([]),
    exclude_repos: z.array(z.string()).default([]),
    exclude_title_patterns: z.array(z.string()).default([]),
    exclude_authors: z.array(z.string()).default([]),
    exclude_labels: z.array(z.string()).default([]),
    confidential_labels: z.array(z.string()).default(["confidential"]),
    include_releases: z.boolean().default(true),
    linear_id_ignore_prefixes: z.array(z.string()).default([]),
  }),
  linear: z.object({
    enabled: z.boolean().default(false),
    teams: z.array(z.string()).default([]),
    feature_labels: z.array(z.string()).default([]),
    exclude_labels: z.array(z.string()).default([]),
    include_states: z.array(z.string()).default([]),
  }),
  rollups: z.array(z.object({ name: z.string().min(1), pattern: z.string().min(1) })).default([]),
  product_areas: z.array(AreaSchema).default([]),
  llm: z.object({
    provider: z.enum(["openrouter"]).default("openrouter"),
    model: z.string(),
    base_url: z.string().optional(),
    batch_size: z.number().int().positive().default(5),
    concurrency: z.number().int().positive().default(3),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path = resolve(process.cwd(), "config.yaml")): Config {
  return ConfigSchema.parse(parse(readFileSync(path, "utf8")));
}

/** Names of required env vars missing for the enabled sources. Never returns values. */
export function missingEnv(cfg: Config, env = process.env, llm = true): string[] {
  const need = ["GITHUB_TOKEN"];
  if (llm) need.push("OPENROUTER_API_KEY");
  if (cfg.linear.enabled) need.push("LINEAR_API_KEY");
  return need.filter((k) => !env[k]);
}
