# BitGo Release Radar (prototype)

One-page summary of upcoming and recently shipped features, built from GitHub (Linear later) and summarized with Claude.

## Status
All phases built: GitHub ingestion (merged, open and approved PRs, releases), Linear ingestion (off until configured), grouping, LLM summaries with caching, the page with detail view and `/digest`, and a scheduled refresh.

## Setup
1. Node 20+ (`node -v`).
2. `npm install`
3. `cp .env.example .env.local` and fill in `GITHUB_TOKEN` (fine-grained, read-only; see `.env.example`).
4. Review `config.yaml`. By default it scans every non-archived repo in the `BitGo` org.
5. `npm run refresh` (flags: `--from-cache` reuse saved GitHub signals, `--no-llm` stop after grouping, `--max-llm=N` cap new summaries)
6. `npm test` / `npm run typecheck`

## Turning on Linear
1. Create a read-only personal API key in Linear (Settings → Account → Security & access) and add it as `LINEAR_API_KEY` in `.env.local` and as a repo secret.
2. In `config.yaml` set `linear.enabled: true`, `linear.teams` (team keys), `linear.feature_labels`, and check `include_states` matches your workflow state names.
3. `npm run refresh`. Projects and labelled issues become features anchored on the Linear project; GitHub PRs join them via ticket IDs or Linear's GitHub attachments, and unshipped projects fill the In development / Planned sections with target dates.
The Linear queries were validated against Linear's published schema but have not been run against a live workspace.

## Access control
Set `SITE_PASSWORD` (e.g. as a Vercel env var) to put the whole site behind a password. For SSO, replace the body of `proxy.ts`.

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
