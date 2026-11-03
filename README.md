# BitGo Release Radar (prototype)

One-page summary of upcoming and recently shipped features, built from GitHub (Linear later) and summarized with Claude.

## Status
Phases 1, 3-7 done: GitHub ingestion, grouping, LLM summaries with caching, the page, and a scheduled refresh. Linear (Phase 2) is parked.

## Setup
1. Node 20+ (`node -v`).
2. `npm install`
3. `cp .env.example .env.local` and fill in `GITHUB_TOKEN` (fine-grained, read-only; see `.env.example`).
4. Review `config.yaml`. By default it scans every non-archived repo in the `BitGo` org.
5. `npm run refresh` (flags: `--from-cache` reuse saved GitHub signals, `--no-llm` stop after grouping, `--max-llm=N` cap new summaries)
6. `npm test` / `npm run typecheck`

## Layout
- `config.yaml` — lookback window, org/repos, filters (edit without touching code)
- `pipeline/` — ingestion, grouping, summarization (standalone script)
- `data/releases.json` — pipeline output the page renders (later phases)
- `app/` — Next.js page (Phase 6)

## Scheduled refresh (GitHub Actions)
`.github/workflows/refresh.yml` runs weekdays at 8am New York time (and on demand via "Run workflow"). It runs `npm run refresh`,
commits `data/releases.json` and `data/cache.json`, and Vercel redeploys on that push.

Repo secrets (Settings → Secrets and variables → Actions):
- `OPENROUTER_API_KEY` (required)
- `RADAR_GITHUB_TOKEN` (optional): without it the built-in token is used, which reads public repos only
- `SLACK_WEBHOOK_URL` (optional): also posts failures to Slack

On failure the job opens (or comments on) a "Release Radar refresh failed" issue, closes it when a later run succeeds, and the page
header turns red while still showing the last good data. A partial failure (e.g. releases unavailable) shows amber. The page also warns
if the data is more than 3 days old.

## Hosting (Vercel, prototype)
The scheduled GitHub Action will commit `data/releases.json`; Vercel redeploys on push. Keep the repo private and
turn on Vercel Deployment Protection so the page isn't public. SSO is out of scope for the prototype.
`middleware.ts` will be left as a no-op auth hook.

## Secrets
Env vars / GitHub Actions secrets only. Never committed, never sent to the client, never logged. See `SECURITY.md`.
