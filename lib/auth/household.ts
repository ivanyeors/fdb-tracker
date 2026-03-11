import { createSupabaseAdmin } from "@/lib/supabase/server"

type HouseholdStage =
  | "config"
  | "lookup_profile"
  | "create_household"
  | "create_profile"

export type GetOrCreateHouseholdResult =
  | {
      ok: true
      householdId: string
      source: "existing_profile" | "created_profile"
    }
  | {
      ok: false
      stage: HouseholdStage
      error: string
      code?: string
    }

const DEFAULT_BIRTH_YEAR = 1990

function getProfileName(
  telegramUserId: string,
  displayName?: string,
): string {
  const trimmed = displayName?.trim()
  return trimmed && trimmed.length > 0
    ? trimmed.slice(0, 120)
    : `Telegram User ${telegramUserId}`
}

export async function getOrCreateHouseholdForTelegramUser(
  telegramUserId: string,
  displayName?: string,
): Promise<GetOrCreateHouseholdResult> {
  let supabase: ReturnType<typeof createSupabaseAdmin>
  try {
    supabase = createSupabaseAdmin()
  } catch (error) {
    return {
      ok: false,
      stage: "config",
      error:
        error instanceof Error ? error.message : "Supabase admin client failed",
    }
  }

  const { data: existingProfile, error: lookupError } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle()

  if (lookupError) {
    return {
      ok: false,
      stage: "lookup_profile",
      error: lookupError.message,
      code: lookupError.code,
    }
  }

  if (existingProfile?.household_id) {
    return {
      ok: true,
      householdId: existingProfile.household_id,
      source: "existing_profile",
    }
  }

  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({ user_count: 1 })
    .select("id")
    .single()

  if (householdError) {
    return {
      ok: false,
      stage: "create_household",
      error: householdError.message,
      code: householdError.code,
    }
  }

  if (!household?.id) {
    return {
      ok: false,
      stage: "create_household",
      error: "Supabase did not return a household ID",
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      household_id: household.id,
      telegram_user_id: telegramUserId,
      name: getProfileName(telegramUserId, displayName),
      birth_year: DEFAULT_BIRTH_YEAR,
    })
    .select("id")
    .single()

  if (profileError) {
    return {
      ok: false,
      stage: "create_profile",
      error: profileError.message,
      code: profileError.code,
    }
  }

  if (!profile?.id) {
    return {
      ok: false,
      stage: "create_profile",
      error: "Supabase did not return a profile ID",
    }
  }

  return { ok: true, householdId: household.id, source: "created_profile" }
}
