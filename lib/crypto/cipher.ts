import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { buildAad, type CryptoContext } from "@/lib/crypto/aad"
import {
  CURRENT_KEY_VERSION,
  getEncryptionKey,
  isSupportedVersion,
  type KeyVersion,
} from "@/lib/crypto/keys"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16

export type EncryptedString = string & { readonly __encrypted: unique symbol }

function encryptBytes(plain: Buffer, ctx: CryptoContext): EncryptedString {
  const version = CURRENT_KEY_VERSION
  const key = getEncryptionKey(version)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(buildAad(ctx))
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, ciphertext, tag]).toString("base64")
  return `${version}:${payload}` as EncryptedString
}

function decryptBytes(blob: string, ctx: CryptoContext): Buffer {
  const colonIdx = blob.indexOf(":")
  if (colonIdx <= 0) {
    throw new Error("Ciphertext missing version prefix")
  }
  const version = blob.slice(0, colonIdx)
  if (!isSupportedVersion(version)) {
    throw new Error(`Unsupported ciphertext version: ${version}`)
  }
  const payload = Buffer.from(blob.slice(colonIdx + 1), "base64")
  if (payload.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Ciphertext payload too short")
  }
  const iv = payload.subarray(0, IV_BYTES)
  const tag = payload.subarray(payload.length - TAG_BYTES)
  const ciphertext = payload.subarray(IV_BYTES, payload.length - TAG_BYTES)

  const key = getEncryptionKey(version as KeyVersion)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAAD(buildAad(ctx))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function encryptString(plain: string, ctx: CryptoContext): EncryptedString {
  return encryptBytes(Buffer.from(plain, "utf8"), ctx)
}

export function decryptString(blob: string, ctx: CryptoContext): string {
  return decryptBytes(blob, ctx).toString("utf8")
}

export function encryptStringNullable(
  plain: string | null | undefined,
  ctx: CryptoContext,
): EncryptedString | null {
  return plain == null ? null : encryptString(plain, ctx)
}

export function decryptStringNullable(
  blob: string | null | undefined,
  ctx: CryptoContext,
): string | null {
  return blob == null ? null : decryptString(blob, ctx)
}

export function encryptNumber(plain: number, ctx: CryptoContext): EncryptedString {
  if (!Number.isFinite(plain)) {
    throw new Error("Cannot encrypt non-finite number")
  }
  return encryptString(plain.toString(), ctx)
}

export function decryptNumber(blob: string, ctx: CryptoContext): number {
  const text = decryptString(blob, ctx)
  const n = Number(text)
  if (!Number.isFinite(n)) {
    throw new Error("Decrypted value is not a finite number")
  }
  return n
}

export function encryptNumberNullable(
  plain: number | null | undefined,
  ctx: CryptoContext,
): EncryptedString | null {
  return plain == null ? null : encryptNumber(plain, ctx)
}

export function decryptNumberNullable(
  blob: string | null | undefined,
  ctx: CryptoContext,
): number | null {
  return blob == null ? null : decryptNumber(blob, ctx)
}

export function encryptJson<T>(plain: T, ctx: CryptoContext): EncryptedString {
  return encryptString(JSON.stringify(plain), ctx)
}

export function decryptJson<T>(blob: string, ctx: CryptoContext): T {
  return JSON.parse(decryptString(blob, ctx)) as T
}

export function encryptJsonNullable<T>(
  plain: T | null | undefined,
  ctx: CryptoContext,
): EncryptedString | null {
  return plain == null ? null : encryptJson(plain, ctx)
}

export function decryptJsonNullable<T>(
  blob: string | null | undefined,
  ctx: CryptoContext,
): T | null {
  return blob == null ? null : decryptJson<T>(blob, ctx)
}
