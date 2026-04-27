import { createHmac } from "node:crypto"

import { type CryptoContext } from "@/lib/crypto/aad"
import { CURRENT_KEY_VERSION, getHashSecret } from "@/lib/crypto/keys"

export function deterministicHash(input: string, ctx: CryptoContext): string {
  if (!input) {
    throw new Error("deterministicHash requires non-empty input")
  }
  const secret = getHashSecret(CURRENT_KEY_VERSION)
  const hmac = createHmac("sha256", secret)
  hmac.update(`${ctx.table}:${ctx.column}:`)
  hmac.update(input, "utf8")
  return hmac.digest("hex")
}

export function deterministicHashNullable(
  input: string | null | undefined,
  ctx: CryptoContext,
): string | null {
  return input == null || input === "" ? null : deterministicHash(input, ctx)
}

export function normalizeTelegramUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase()
}

export function normalizeTelegramId(id: string | number): string {
  return String(id).trim()
}

export function normalizeAccountNumber(value: string): string {
  return value.replaceAll(/[\s-]/g, "")
}
