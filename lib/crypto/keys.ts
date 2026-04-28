export type KeyVersion = "v1" | "v2"

const SUPPORTED_VERSIONS: readonly KeyVersion[] = ["v1", "v2"] as const

function resolveCurrentKeyVersion(): KeyVersion {
  const override = process.env.PII_CURRENT_KEY_VERSION?.trim()
  if (override && (SUPPORTED_VERSIONS as readonly string[]).includes(override)) {
    return override as KeyVersion
  }
  return "v1"
}

// Resolved at module load. Tests that swap PII_CURRENT_KEY_VERSION at runtime
// must call __resetKeyCacheForTests() to reload (the cache is on getKeys()).
export const CURRENT_KEY_VERSION: KeyVersion = resolveCurrentKeyVersion()

const ENCRYPTION_KEY_BYTES = 32
const HASH_SECRET_MIN_BYTES = 32

export interface KeyRegistry {
  encryptionKeys: Record<KeyVersion, Buffer>
  hashSecrets: Record<KeyVersion, Buffer>
}

let cached: KeyRegistry | null = null

function decodeBase64(value: string, label: string): Buffer {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${label} is empty`)
  }
  let buf: Buffer
  try {
    buf = Buffer.from(trimmed, "base64")
  } catch {
    throw new Error(`${label} is not valid base64`)
  }
  if (buf.length === 0) {
    throw new Error(`${label} decoded to zero bytes`)
  }
  return buf
}

function loadKeys(): KeyRegistry {
  const encryptionKeys = {} as Record<KeyVersion, Buffer>
  const hashSecrets = {} as Record<KeyVersion, Buffer>

  for (const version of SUPPORTED_VERSIONS) {
    const upper = version.toUpperCase()
    const encEnv = `PII_ENCRYPTION_KEY_${upper}`
    const hashEnv = `PII_HASH_SECRET_${upper}`

    const encRaw = process.env[encEnv]
    const hashRaw = process.env[hashEnv]

    if (version === CURRENT_KEY_VERSION) {
      if (!encRaw) throw new Error(`Missing required env var ${encEnv}`)
      if (!hashRaw) throw new Error(`Missing required env var ${hashEnv}`)
    }
    if (!encRaw && !hashRaw) continue

    if (!encRaw) throw new Error(`${encEnv} is set elsewhere — also set ${encEnv}`)
    if (!hashRaw) throw new Error(`${hashEnv} required to match ${encEnv}`)

    const encKey = decodeBase64(encRaw, encEnv)
    if (encKey.length !== ENCRYPTION_KEY_BYTES) {
      throw new Error(
        `${encEnv} must be ${ENCRYPTION_KEY_BYTES} bytes (got ${encKey.length}). Generate with: openssl rand -base64 32`,
      )
    }
    const hashKey = decodeBase64(hashRaw, hashEnv)
    if (hashKey.length < HASH_SECRET_MIN_BYTES) {
      throw new Error(
        `${hashEnv} must be at least ${HASH_SECRET_MIN_BYTES} bytes (got ${hashKey.length}). Generate with: openssl rand -base64 32`,
      )
    }

    encryptionKeys[version] = encKey
    hashSecrets[version] = hashKey
  }

  if (Object.keys(encryptionKeys).length === 0) {
    throw new Error("No PII encryption keys configured")
  }

  return { encryptionKeys, hashSecrets }
}

export function getKeys(): KeyRegistry {
  cached ??= loadKeys()
  return cached
}

export function getEncryptionKey(version: KeyVersion): Buffer {
  const key = getKeys().encryptionKeys[version]
  if (!key) throw new Error(`No encryption key registered for version ${version}`)
  return key
}

export function getHashSecret(version: KeyVersion = CURRENT_KEY_VERSION): Buffer {
  const secret = getKeys().hashSecrets[version]
  if (!secret) throw new Error(`No hash secret registered for version ${version}`)
  return secret
}

export function assertCryptoConfigured(): void {
  getKeys()
}

export function isSupportedVersion(value: string): value is KeyVersion {
  return (SUPPORTED_VERSIONS as readonly string[]).includes(value)
}

export function __resetKeyCacheForTests(): void {
  cached = null
}
