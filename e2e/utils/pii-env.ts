/**
 * Convert TEST_PII_* env vars (the ones stored in .env.test.local + GitHub
 * secrets) into the format `lib/crypto/keys.ts` expects: 32-byte values
 * base64-encoded. Existing test secrets were stored as 64-char hex; if we
 * detect that format we transcode to base64 transparently so the secrets
 * don't have to be rotated.
 *
 * Returns a map suitable for spreading into a child-process env or for
 * applying to process.env via Object.assign.
 */
function transcode(value: string | undefined): string | undefined {
  if (!value) return value
  const trimmed = value.trim()
  if (trimmed.length === 0) return trimmed
  // 64 hex chars → 32 raw bytes → re-encode as base64.
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex").toString("base64")
  }
  return trimmed
}

export function mapTestPiiKeysToRuntime(
  source: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const out: Record<string, string> = {}
  const enc = transcode(source.TEST_PII_ENCRYPTION_KEY_V1)
  const hash = transcode(source.TEST_PII_HASH_SECRET_V1)
  if (enc) out.PII_ENCRYPTION_KEY_V1 = enc
  if (hash) out.PII_HASH_SECRET_V1 = hash
  return out
}

/**
 * Apply the converted keys to process.env in-place. Returns the keys that
 * were set so callers can log them (without values).
 */
export function applyTestPiiKeysToProcessEnv(
  source: NodeJS.ProcessEnv = process.env
): string[] {
  const mapped = mapTestPiiKeysToRuntime(source)
  for (const [k, v] of Object.entries(mapped)) {
    process.env[k] = v
  }
  return Object.keys(mapped)
}
