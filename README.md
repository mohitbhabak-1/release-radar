# BitGo Release Radar (prototype)

One-page summary of upcoming and recently shipped features, built from GitHub (Linear later) and summarized with Claude.

## Status
Phases 1, 3, 4, 5 done: GitHub ingestion, grouping, LLM summaries with caching. The page itself is a placeholder (Phase 6).

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

## Hosting (Vercel, prototype)
The scheduled GitHub Action will commit `data/releases.json`; Vercel redeploys on push. Keep the repo private and
turn on Vercel Deployment Protection so the page isn't public. SSO is out of scope for the prototype.
`middleware.ts` will be left as a no-op auth hook.

## Secrets
Env vars / GitHub Actions secrets only. Never committed, never sent to the client, never logged. See `SECURITY.md`.
