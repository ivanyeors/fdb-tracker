/**
 * Rename TEST_PII_* (the CI/local-only key namespace) to PII_* (what
 * `lib/crypto/keys.ts` expects at runtime). Stored as 32-byte base64 in both
 * places — no format conversion, just a key-name rename.
 *
 * Returns a map suitable for spreading into a child-process env or for
 * applying to process.env via Object.assign.
 */
export function mapTestPiiKeysToRuntime(
  source: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const out: Record<string, string> = {}
  if (source.TEST_PII_ENCRYPTION_KEY_V1) {
    out.PII_ENCRYPTION_KEY_V1 = source.TEST_PII_ENCRYPTION_KEY_V1
  }
  if (source.TEST_PII_HASH_SECRET_V1) {
    out.PII_HASH_SECRET_V1 = source.TEST_PII_HASH_SECRET_V1
  }
  return out
}

/**
 * Apply the renamed keys to process.env in-place. Returns the keys that
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
