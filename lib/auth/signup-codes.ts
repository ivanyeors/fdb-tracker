import {
  encodeSignupCodePiiPatch,
  hashSignupCodeTelegramUsername,
} from "@/lib/repos/signup-codes"
import { createSupabaseAdmin } from "@/lib/supabase/server"

// Exclude ambiguous characters: 0/O, 1/I/L
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 8
const SIGNUP_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes
const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours
const SIGNUP_RATE_LIMIT = 5 // max codes per hour per username

function generateCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(values)
    .map((v) => CODE_CHARS[v % CODE_CHARS.length])
    .join("")
}

export type GenerateCodeResult =
  | { ok: true; code: string }
  | { ok: false; error: string }

export async function generateSignupCode(
  telegramUsername: string
): Promise<GenerateCodeResult> {
  const supabase = createSupabaseAdmin()
  const normalized = telegramUsername.replace(/^@/, "").trim().toLowerCase()

  // Rate limit: max 5 codes per hour per username
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const usernameHash = hashSignupCodeTelegramUsername(normalized)
  const { count } = await supabase
    .from("signup_codes")
    .select("id", { count: "exact", head: true })
    .eq("type", "signup")
    .eq("telegram_username_hash", usernameHash)
    .gte("created_at", oneHourAgo)

  if (count != null && count >= SIGNUP_RATE_LIMIT) {
    return { ok: false, error: "Too many attempts. Please wait and try again." }
  }

  const code = generateCode()
  const usernameEncoded = encodeSignupCodePiiPatch({
    telegram_username: normalized,
  })
  const { error } = await supabase.from("signup_codes").insert({
    type: "signup",
    code,
    telegram_username: normalized,
    ...usernameEncoded,
    expires_at: new Date(Date.now() + SIGNUP_EXPIRY_MS).toISOString(),
  })

  if (error) {
    // Retry once on code collision
    const retryCode = generateCode()
    const { error: retryError } = await supabase.from("signup_codes").insert({
      type: "signup",
      code: retryCode,
      telegram_username: normalized,
      ...usernameEncoded,
      expires_at: new Date(Date.now() + SIGNUP_EXPIRY_MS).toISOString(),
    })
    if (retryError) {
      return { ok: false, error: "Failed to generate code. Please try again." }
    }
    return { ok: true, code: retryCode }
  }

  return { ok: true, code }
}

export async function generateInviteCode(
  householdId: string,
  targetProfileId?: string
): Promise<GenerateCodeResult> {
  const supabase = createSupabaseAdmin()
  const code = generateCode()

  const { error } = await supabase.from("signup_codes").insert({
    type: "invite",
    code,
    household_id: householdId,
    target_profile_id: targetProfileId ?? null,
    created_by_household_id: householdId,
    expires_at: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(),
  })

  if (error) {
    const retryCode = generateCode()
    const { error: retryError } = await supabase.from("signup_codes").insert({
      type: "invite",
      code: retryCode,
      household_id: householdId,
      target_profile_id: targetProfileId ?? null,
      created_by_household_id: householdId,
      expires_at: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(),
    })
    if (retryError) {
      return { ok: false, error: "Failed to generate invite code." }
    }
    return { ok: true, code: retryCode }
  }

  return { ok: true, code }
}

export type ValidateCodeResult =
  | {
      ok: true
      id: string
      type: "signup" | "invite"
      code: string
      householdId: string | null
      telegramUsername: string | null
      targetProfileId: string | null
    }
  | { ok: false; error: string }

export async function validateCode(code: string): Promise<ValidateCodeResult> {
  const supabase = createSupabaseAdmin()
  const normalized = code.trim().toUpperCase()

  const { data, error } = await supabase
    .from("signup_codes")
    .select("*")
    .eq("code", normalized)
    .eq("used", false)
    .maybeSingle()

  const logCtx = {
    inputLength: code.length,
    normalizedPrefix: normalized.slice(0, 2) + "***",
    found: !!data,
    queryError: error?.message,
  }

  if (error || !data) {
    console.log("[signup/validate] miss", logCtx)
    return { ok: false, error: "Invalid or already-used code." }
  }

  if (new Date(data.expires_at) < new Date()) {
    console.log("[signup/validate] expired", {
      ...logCtx,
      expiresAt: data.expires_at,
    })
    return { ok: false, error: "This code has expired." }
  }

  console.log("[signup/validate] ok", { ...logCtx, type: data.type })

  return {
    ok: true,
    id: data.id,
    type: data.type as "signup" | "invite",
    code: data.code,
    householdId: data.household_id,
    telegramUsername: data.telegram_username,
    targetProfileId: data.target_profile_id,
  }
}

export async function markCodeUsed(
  codeId: string,
  telegramUserId: string
): Promise<boolean> {
  const supabase = createSupabaseAdmin()
  const usedByEncoded = encodeSignupCodePiiPatch({
    used_by_telegram_user_id: telegramUserId,
  })

  const { data, error } = await supabase
    .from("signup_codes")
    .update({
      used: true,
      used_by_telegram_user_id: telegramUserId,
      ...usedByEncoded,
    })
    .eq("id", codeId)
    .eq("used", false)
    .select("id")
    .maybeSingle()

  return !error && data != null
}
