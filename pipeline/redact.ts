/**
 * Redaction pass run on every string before it is sent to an LLM.
 * Strips secrets, keys, blockchain addresses, hashes, emails and customer/org identifiers.
 * Deliberately aggressive: a summary never needs these values.
 */
const RULES: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private-key]"],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret]"],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[secret]"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[secret]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "[secret]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*\b/g, "[token]"], // JWT
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [token]"],
  [/\b(password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\b(\s*[:=]\s*)(["']?)[^\s"',;]{8,}\3/gi, "$1$2$3[redacted]$3"],
  [/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@[^\s]+/g, "[url-with-credentials]"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  [/\b(?:xpub|ypub|zpub|tpub|xprv|yprv|zprv|tprv)[1-9A-HJ-NP-Za-km-z]{50,}\b/g, "[extended-key]"],
  [/\b0x[0-9a-fA-F]{40,}\b/g, "[address]"], // EVM addresses, long hex
  [/\b(?:bc1|tb|ltc1|bcrt1)[a-z0-9]{25,90}\b/g, "[address]"], // bech32
  [/\b[13][1-9A-HJ-NP-Za-km-z]{25,34}\b/g, "[address]"], // legacy BTC
  [/\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/g, "[address]"], // base58 (Solana-style)
  [/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, "[id]"], // UUID
  [/\b[0-9a-fA-F]{24}\b/g, "[id]"], // Mongo-style org/wallet/enterprise IDs
  [/\b[0-9a-fA-F]{32,}\b/g, "[hash]"], // sha / long hex
];

export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}
