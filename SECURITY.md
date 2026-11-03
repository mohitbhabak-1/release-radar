# Security and data handling

Written for review against BitGo's internal AI-tool policy. Status: prototype.

## Data pulled
| Source | What | What is NOT pulled |
|---|---|---|
| GitHub (org `BitGo`) | Merged PR titles and bodies (truncated to 2,000 chars), labels, author login, merge date; open PRs that are approved or carry a configured label; release names and notes; repo names | Code, diffs, commits, comments, review text, secrets, issues |
| Linear (optional, off by default) | Project name, description, lead, target date, status, latest project updates, document titles; issue identifier, title, description, state, assignee, labels, GitHub PR attachment links | Comments, attachments' contents, customers, roadmap fields outside the configured teams |

Only repos and teams allowed by `config.yaml` are read, and only the GitHub scopes listed under Tokens.

## Data sent to the LLM
- Per feature: titles, descriptions (truncated to 700 chars per item, at most 6 items), labels, dates and status.
- Never sent: code, diffs, author or owner names, URLs, file contents, environment or config values.
- Before sending, every string passes `pipeline/redact.ts`, which replaces secrets and tokens (GitHub, AWS, Slack, JWT, bearer, `key=value` credentials, private keys), emails, URLs with credentials, blockchain addresses (EVM, bech32, legacy, base58), extended keys, UUIDs, 24-hex IDs and long hashes. It is aggressive on purpose and unit-tested.
- Route: the pipeline calls OpenRouter (`openrouter.ai`), which forwards the request to Anthropic's Claude Sonnet 5.5 through a cloud provider (for example Amazon Bedrock). OpenRouter is therefore an extra third-party recipient of the redacted text above. To remove it, point `llm.base_url` at an approved gateway.
- Prompt injection: PR and ticket text is treated as untrusted data. The model can only return a fixed JSON structure; links, owners, stage and dates come from code, and the model can only soften a stage with a written reason.
- The model's output is validated against a schema, and summaries are cached by a hash of their redacted input, so unchanged items are not re-sent.

## What is stored and where
- `data/releases.json` and `data/cache.json` (summaries, titles, links, contributor GitHub logins, dates) are committed to the repository. `data/features.raw.json` and `.cache/` (raw signals with truncated bodies) are gitignored and never leave the machine or CI runner.
- The repo is currently public. Everything in the data files derives from public BitGo repos today. Before connecting private repos or Linear, make the repo private.

## Confidential work
- Anything carrying a label in `github.confidential_labels` or `linear.confidential_labels` (default `confidential`) is dropped at ingestion. GitHub work that references a confidential Linear ticket is dropped too. `exclude_labels` additionally removes chores.

## Tokens
| Secret | Purpose | Least privilege |
|---|---|---|
| `GITHUB_TOKEN` / `RADAR_GITHUB_TOKEN` | Read PRs and releases | Fine-grained, read-only: Metadata, Pull requests, Contents. The prototype currently uses a broader personal token; replace it |
| `OPENROUTER_API_KEY` | LLM calls | Set a monthly spend cap in OpenRouter |
| `LINEAR_API_KEY` | Linear reads | Personal API key; read-only access is enough |
| `SITE_PASSWORD` | Optional page password | |
| `SLACK_WEBHOOK_URL` | Optional failure alerts | |

Secrets live only in environment variables and GitHub Actions secrets. They are never committed, never sent to the browser (the page is static and only reads the data files), and never logged: error text is scrubbed and capped before it is written to a file or issue.

**Revoke:** GitHub → Settings → Developer settings → Tokens → Delete. OpenRouter → Keys → Delete. Linear → Settings → Account → Security & access → Revoke. Then delete the matching repo secret.

## Access to the page
- `proxy.ts` runs on every request. If `SITE_PASSWORD` is set the page requires it (HTTP Basic). This is a stopgap, not SSO.
- For production, replace the body of `proxy.ts` with your SSO check (session cookie or identity-proxy header) and keep the deployment behind your IdP. Do not deploy publicly.

## Reliability and integrity
- A refresh that returns under 30% of the previous feature count fails instead of overwriting the page, and the header shows red. A partial failure shows amber.
- The page warns when data is older than 3 days. Failures open a GitHub issue (and optionally a Slack message) with scrubbed error text.
- Summaries are AI-generated. The page says so and links every summary to its source PRs, releases and tickets, and `/feature/[id]` lists the evidence.
