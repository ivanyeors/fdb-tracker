/**
 * Household resolution for Telegram commands.
 * Used by webhook and OTP wizard to resolve household_id from chat/user/username.
 */

import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function getHouseholdFromLinkedProfile(
  chatId: string,
  fromUserId: string | null,
): Promise<string | null> {
  const supabase = createSupabaseAdmin()
  const orConditions = fromUserId
    ? `telegram_chat_id.eq.${chatId},telegram_user_id.eq.${fromUserId}`
    : `telegram_chat_id.eq.${chatId}`

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("family_id")
    .or(orConditions)
    .limit(1)
    .maybeSingle()

  if (profileError || !profile) return null

  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("household_id")
    .eq("id", profile.family_id)
    .single()

  if (familyError || !family) return null
  return family.household_id
}

export async function getHouseholdFromLinkedAccount(
  telegramUserId: string,
): Promise<string | null> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("linked_telegram_accounts")
    .select("household_id")
    .eq("telegram_user_id", telegramUserId)
    .order("linked_at", { ascending: false })
    .limit(1)

  if (error || !data?.[0]) return null
  return data[0].household_id
}

function normalizeTelegramUsername(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase()
}

export async function getHouseholdFromTelegramUsername(
  username: string,
): Promise<string | null> {
  const normalized = normalizeTelegramUsername(username)
  if (!normalized) return null

  const supabase = createSupabaseAdmin()

  const { data: linked, error: linkedError } = await supabase
    .from("linked_telegram_accounts")
    .select("household_id")
    .ilike("telegram_username", normalized)
    .order("linked_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!linkedError && linked?.household_id) return linked.household_id

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("family_id")
    .ilike("telegram_username", normalized)
    .limit(1)
    .maybeSingle()

  if (profileError || !profile) return null

  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("household_id")
    .eq("id", profile.family_id)
    .single()

  if (familyError || !family) return null
  return family.household_id
}

export type ResolveHouseholdOptions = {
  telegramUsername?: string | null
  allowCreate?: boolean
}

export async function resolveHouseholdId(
  chatId: string,
  fromUserId: string | null,
  options: ResolveHouseholdOptions = {},
): Promise<string | null> {
  const { telegramUsername, allowCreate = true } = options
  const fromUserIdStr = fromUserId != null ? String(fromUserId) : null

  const fromProfile = await getHouseholdFromLinkedProfile(chatId, fromUserIdStr)
  if (fromProfile) return fromProfile

  if (fromUserIdStr) {
    const fromLinked = await getHouseholdFromLinkedAccount(fromUserIdStr)
    if (fromLinked) return fromLinked
  }

  if (telegramUsername) {
    const fromUsername = await getHouseholdFromTelegramUsername(telegramUsername)
    if (fromUsername) return fromUsername
  }

  if (!allowCreate) return null

  return getOrCreateAccount(chatId)
}

export type ProfileContext = {
  householdId: string
  profileId: string | null
  familyId: string | null
}

export async function resolveProfileContext(
  chatId: string,
  fromUserId: string | null,
  options: ResolveHouseholdOptions = {},
): Promise<ProfileContext | null> {
  const fromUserIdStr = fromUserId != null ? String(fromUserId) : null

  if (fromUserIdStr) {
    const supabase = createSupabaseAdmin()
    const orConditions = `telegram_chat_id.eq.${chatId},telegram_user_id.eq.${fromUserIdStr}`

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id")
      .or(orConditions)
      .limit(1)
      .maybeSingle()

    if (profile) {
      const { data: family } = await supabase
        .from("families")
        .select("household_id")
        .eq("id", profile.family_id)
        .single()

      if (family) {
        return {
          householdId: family.household_id,
          profileId: profile.id,
          familyId: profile.family_id,
        }
      }
    }
  }

  const householdId = await resolveHouseholdId(chatId, fromUserId, options)
  if (!householdId) return null

  return { householdId, profileId: null, familyId: null }
}

export async function getOrCreateAccount(chatId: string): Promise<string | null> {
  try {
    const supabase = createSupabaseAdmin()

    const { data: existing, error: lookupError } = await supabase
      .from("households")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle()

    if (lookupError) {
      console.error("[telegram] Account lookup failed:", lookupError.message)
      return null
    }

    if (existing?.id) return existing.id

    const { data: created, error: createError } = await supabase
      .from("households")
      .insert({ user_count: 1, telegram_chat_id: chatId })
      .select("id")
      .single()

    if (createError) {
      console.error("[telegram] Account creation failed:", createError.message)
      return null
    }

    const householdId = created?.id
    if (!householdId) return null

    const { error: familyError } = await supabase.from("families").insert({
      household_id: householdId,
      name: "Family 1",
      user_count: 1,
    })

    if (familyError) {
      console.error("[telegram] Family creation failed:", familyError.message)
      return householdId
    }

    return householdId
  } catch (err) {
    console.error("[telegram] getOrCreateAccount error:", err)
    return null
  }
}
