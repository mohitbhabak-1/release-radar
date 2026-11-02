import { describe, expect, it } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  const cases: [string, string, string][] = [
    ["email", "contact alice@example.com now", "alice@example.com"],
    ["github token", "use ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abcdef"],
    ["openai/openrouter-style key", "key sk-or-v1-abcdef0123456789abcdef0123456789", "sk-or-v1"],
    ["aws key", "AKIAIOSFODNN7EXAMPLE leaked", "AKIAIOSFODNN7EXAMPLE"],
    ["bearer", "Authorization: Bearer abcdef1234567890abcdef", "abcdef1234567890"],
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123", "eyJhbGci"],
    ["evm address", "contract 0x52908400098527886E0F7030069857D2E4169EE7 added", "0x5290"],
    ["bech32", "send to bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "bc1qar0"],
    ["legacy btc", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "1BvBMSE"],
    ["xpub", "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8", "xpub661"],
    ["uuid", "org 123e4567-e89b-12d3-a456-426614174000", "123e4567"],
    ["mongo id", "enterprise 5f8d0d55b54764421b7156c3 failed", "5f8d0d55b5"],
    ["sha", "commit a94a8fe5ccb19ba61c4c0873d391e987982fbbd3", "a94a8fe5"],
    ["credential assignment", 'password = "hunter2hunter2"', "hunter2"],
    ["url creds", "postgres://user:pass1234@db.internal/app", "pass1234"],
    ["private key", "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----", "MIIabc"],
  ];
  it.each(cases)("redacts %s", (_n, input, secret) => {
    const out = redact(input);
    expect(out).not.toContain(secret);
    expect(out).toMatch(/\[[a-z-]+\]|\[redacted\]/);
  });
  it("leaves ordinary prose and ticket IDs alone", () => {
    const t = "feat(statics): add staking for Ethereum tokens (WAL-123), see PR #10094";
    expect(redact(t)).toBe(t);
  });
  it("keeps the credential key name", () => {
    expect(redact("api_key: abcdefgh12345678")).toContain("api_key");
  });
});
