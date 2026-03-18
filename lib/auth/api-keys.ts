import { sha256 } from "@/lib/auth/otp"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const API_KEY_PREFIX = "fdb_"
const API_KEY_RANDOM_LENGTH = 32

export type ValidateApiKeyResult =
  | {
      ok: true
      householdId: string
      apiKeyId: string
      maxMembers: number
    }
  | { ok: false }

function randomHex(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function generateApiKey(): Promise<{
  rawKey: string
  hash: string
  prefix: string
}> {
  const randomPart = randomHex(API_KEY_RANDOM_LENGTH)
  const rawKey = `${API_KEY_PREFIX}${randomPart}`
  const hash = await sha256(rawKey)
  const prefix = rawKey.slice(0, 8)
  return { rawKey, hash, prefix }
}

export async function validateApiKey(
  rawKey: string,
): Promise<ValidateApiKeyResult> {
  if (!rawKey.startsWith(API_KEY_PREFIX) || rawKey.length < 12) {
    return { ok: false }
  }

  const hash = await sha256(rawKey.trim())
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from("link_api_keys")
    .select("id, household_id, max_members")
    .eq("api_key_hash", hash)
    .maybeSingle()

  if (error || !data) {
    return { ok: false }
  }

  return {
    ok: true,
    householdId: data.household_id,
    apiKeyId: data.id,
    maxMembers: data.max_members,
  }
}

export async function countLinkedMembers(
  apiKeyId: string,
): Promise<number> {
  const supabase = createSupabaseAdmin()
  const { count, error } = await supabase
    .from("linked_telegram_accounts")
    .select("id", { count: "exact", head: true })
    .eq("link_api_key_id", apiKeyId)

  if (error) return 0
  return count ?? 0
}
