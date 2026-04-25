/**
 * Household resolution for Telegram commands.
 * Used by webhook and OTP wizard to resolve household_id from chat/user/username.
 */

import { encodeFamilyPiiPatch } from "@/lib/repos/families"
import { encodeHouseholdPiiPatch } from "@/lib/repos/households"
import { encodeProfilePiiPatch } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function getHouseholdFromLinkedProfile(
  chatId: string,
  fromUserId: string | null
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
  telegramUserId: string
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
  username: string
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
  options: ResolveHouseholdOptions = {}
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
    const fromUsername =
      await getHouseholdFromTelegramUsername(telegramUsername)
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
  options: ResolveHouseholdOptions = {}
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

/** Context returned by resolveOrProvisionPublicUser — includes account type. */
export type PublicUserContext = {
  householdId: string
  familyId: string
  profileId: string
  accountType: "owner" | "public"
}

/**
 * Resolve an existing user OR auto-provision a new public account.
 * Used by the webhook handler so that any Telegram user can start using
 * the bot immediately without web onboarding.
 */
export async function resolveOrProvisionPublicUser(
  chatId: string,
  fromUserId: string | null,
  fromUsername: string | null,
  firstName: string | null
): Promise<PublicUserContext | null> {
  const supabase = createSupabaseAdmin()
  const fromUserIdStr = fromUserId != null ? String(fromUserId) : null

  // 1. Check profiles table by telegram_user_id or telegram_chat_id
  if (fromUserIdStr) {
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
        const { data: household } = await supabase
          .from("households")
          .select("account_type")
          .eq("id", family.household_id)
          .single()

        return {
          householdId: family.household_id,
          familyId: profile.family_id,
          profileId: profile.id,
          accountType:
            (household?.account_type as "owner" | "public") ?? "owner",
        }
      }
    }
  }

  // 2. Check linked_telegram_accounts
  if (fromUserIdStr) {
    const { data: linked } = await supabase
      .from("linked_telegram_accounts")
      .select("household_id")
      .eq("telegram_user_id", fromUserIdStr)
      .order("linked_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (linked) {
      // Resolve the first family + first profile in that household
      const { data: family } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", linked.household_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      let profileId: string | null = null
      if (family) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("family_id", family.id)
          .limit(1)
          .maybeSingle()
        profileId = profile?.id ?? null
      }

      const { data: household } = await supabase
        .from("households")
        .select("account_type")
        .eq("id", linked.household_id)
        .single()

      if (family && profileId) {
        return {
          householdId: linked.household_id,
          familyId: family.id,
          profileId,
          accountType:
            (household?.account_type as "owner" | "public") ?? "owner",
        }
      }
    }
  }

  // 3. Auto-provision a new public account
  try {
    const displayName = firstName || fromUsername || "User"

    const { data: household, error: householdError } = await supabase
      .from("households")
      .insert({
        user_count: 1,
        telegram_chat_id: chatId,
        ...encodeHouseholdPiiPatch({ telegram_chat_id: chatId }),
        account_type: "public",
        onboarding_completed_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (householdError || !household) {
      console.error(
        "[telegram] Public account creation failed:",
        householdError?.message
      )
      return null
    }

    const { data: family, error: familyError } = await supabase
      .from("families")
      .insert({
        household_id: household.id,
        name: "Personal",
        ...encodeFamilyPiiPatch({ name: "Personal" }),
        user_count: 1,
      })
      .select("id")
      .single()

    if (familyError || !family) {
      console.error(
        "[telegram] Public family creation failed:",
        familyError?.message
      )
      return null
    }

    const profilePiiInput = {
      name: displayName,
      birth_year: 2000,
      telegram_user_id: fromUserIdStr,
      telegram_chat_id: chatId,
      telegram_username: fromUsername ?? null,
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        family_id: family.id,
        name: displayName,
        birth_year: 2000,
        telegram_user_id: fromUserIdStr,
        telegram_chat_id: chatId,
        telegram_username: fromUsername
          ? fromUsername.replace(/^@/, "").toLowerCase()
          : null,
        telegram_last_used: new Date().toISOString(),
        ...encodeProfilePiiPatch(profilePiiInput),
      })
      .select("id")
      .single()

    if (profileError || !profile) {
      console.error(
        "[telegram] Public profile creation failed:",
        profileError?.message
      )
      return null
    }

    console.log(
      "[telegram] Auto-provisioned public account:",
      JSON.stringify({
        householdId: household.id,
        familyId: family.id,
        profileId: profile.id,
      })
    )

    return {
      householdId: household.id,
      familyId: family.id,
      profileId: profile.id,
      accountType: "public",
    }
  } catch (err) {
    console.error("[telegram] resolveOrProvisionPublicUser error:", err)
    return null
  }
}

export async function getOrCreateAccount(
  chatId: string
): Promise<string | null> {
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
      .insert({
        user_count: 1,
        telegram_chat_id: chatId,
        ...encodeHouseholdPiiPatch({ telegram_chat_id: chatId }),
      })
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
      ...encodeFamilyPiiPatch({ name: "Family 1" }),
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
