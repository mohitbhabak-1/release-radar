# Security (draft, completed in Phase 8)

- **Pulled:** PR titles, bodies (truncated), labels, authors, merge dates, release notes, repo names. No code or diffs.
- **Sent to the LLM:** only titles, descriptions (truncated to 700 chars), labels, dates and status per feature, after the redaction pass in `pipeline/redact.ts` (secrets, tokens, keys, emails, blockchain addresses, hashes, UUIDs and 24-hex org/wallet IDs). No code or diffs. Author logins are not sent.
- **LLM route:** requests go to OpenRouter (`openrouter.ai`) which forwards them to Anthropic's Claude Sonnet 5.5 (via a cloud provider such as Amazon Bedrock). OpenRouter is therefore an additional third-party data recipient to review against the AI-tool policy.
- **Prompt injection:** PR text is treated as untrusted data; the model can only return structured fields, and links and stages come from code, not the model.
- **Tokens:** `GITHUB_TOKEN` (fine-grained, read-only), `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY`), `LINEAR_API_KEY` (read-only, currently unused). Stored only as env vars / GitHub Actions secrets.
- **Revoke:** GitHub → Settings → Developer settings → Fine-grained tokens → Delete. OpenRouter → Settings → Keys → Delete (or Anthropic Console → API keys → Revoke).
- **Excluded:** anything labeled in `exclude_labels` (including `confidential`) never leaves the ingestion step.
- **Access:** prototype is protected only by private repo + Vercel Deployment Protection. SSO is a TODO before wider rollout.
