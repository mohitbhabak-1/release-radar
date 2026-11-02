import { z } from "zod";
import type { Config } from "./config";

const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(2 ** attempt * 1000, 60_000) + Math.floor(Math.random() * 500);

export const usage = { calls: 0, promptTokens: 0, completionTokens: 0 };

type ToolRequest<T> = {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
};

/**
 * Calls the model with a single forced tool so the reply is structured JSON, then validates it with zod.
 * Retries with backoff on rate limits, 5xx, network errors and invalid output. Never logs the key or prompts.
 */
export async function callTool<T>(cfg: Config, req: ToolRequest<T>): Promise<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const url = `${cfg.llm.base_url ?? "https://openrouter.ai/api/v1"}/chat/completions`;
  const { $schema: _omit, ...parameters } = z.toJSONSchema(req.schema) as Record<string, unknown>;

  let lastErr = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Release Radar" },
        body: JSON.stringify({
          model: cfg.llm.model,
          temperature: 0,
          messages: [
            { role: "system", content: `${req.system}\n\nAlways respond by calling the ${req.toolName} tool. Do not reply with plain text.` },
            { role: "user", content: req.user },
          ],
          tools: [{ type: "function", function: { name: req.toolName, description: req.toolDescription, parameters } }],
          // Forced tool_choice is rejected by some providers for this model; "auto" plus the instruction below works.
          tool_choice: "auto",
        }),
      });
    } catch (e) {
      lastErr = `network error: ${e instanceof Error ? e.message : "unknown"}`;
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 401 || res.status === 402) throw new Error(`OpenRouter rejected the request (HTTP ${res.status}). Check OPENROUTER_API_KEY / credits.`);
    if (res.status === 429 || res.status >= 500) {
      lastErr = `HTTP ${res.status}`;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
      continue;
    }
    if (!res.ok) {
      // Provider error bodies describe the request problem; they never echo the key.
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`OpenRouter error: HTTP ${res.status} ${detail}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    usage.calls++;
    usage.promptTokens += json.usage?.prompt_tokens ?? 0;
    usage.completionTokens += json.usage?.completion_tokens ?? 0;

    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      lastErr = json.error?.message ?? "model returned no tool call";
      await sleep(backoff(attempt));
      continue;
    }
    try {
      return req.schema.parse(JSON.parse(args));
    } catch (e) {
      lastErr = `invalid structured output: ${e instanceof Error ? e.message.slice(0, 200) : "parse error"}`;
    }
  }
  throw new Error(`LLM call failed after ${MAX_ATTEMPTS} attempts (${lastErr})`);
}
