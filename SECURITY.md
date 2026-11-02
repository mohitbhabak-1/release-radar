# Security (draft, completed in Phase 8)

- **Pulled:** PR titles, bodies (truncated), labels, authors, merge dates, release notes, repo names. No code or diffs.
- **Sent to Anthropic:** only normalized titles/descriptions/labels/dates/owners, after a redaction pass (secrets, keys, addresses, emails, IDs).
- **Tokens:** `GITHUB_TOKEN` (fine-grained, read-only), `ANTHROPIC_API_KEY`, `LINEAR_API_KEY` (read-only, currently unused). Stored only as env vars / GitHub Actions secrets.
- **Revoke:** GitHub → Settings → Developer settings → Fine-grained tokens → Delete. Anthropic Console → API keys → Revoke.
- **Excluded:** anything labeled in `exclude_labels` (including `confidential`) never leaves the ingestion step.
- **Access:** prototype is protected only by private repo + Vercel Deployment Protection. SSO is a TODO before wider rollout.
