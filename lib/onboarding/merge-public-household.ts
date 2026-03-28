import { SupabaseClient } from "@supabase/supabase-js"

export type MergeResult = {
  success: boolean
  migratedProfileIds: string[]
  error?: string
}

/**
 * Merge a public (Telegram-only) household into a target household.
 * Reassigns all data from the source's first family to the target's first family,
 * then deletes the source family and household.
 */
export async function mergePublicHousehold(
  supabase: SupabaseClient,
  sourceHouseholdId: string,
  targetHouseholdId: string
): Promise<MergeResult> {
  const fail = (error: string): MergeResult => ({
    success: false,
    migratedProfileIds: [],
    error,
  })

  // 1. Verify source is a public account
  const { data: sourceHousehold } = await supabase
    .from("households")
    .select("id, account_type, telegram_chat_id")
    .eq("id", sourceHouseholdId)
    .single()

  if (!sourceHousehold) return fail("Source household not found")
  if (sourceHousehold.account_type !== "public")
    return fail("Source household is not a public account")

  // 2. Get source and target first families
  const [{ data: sourceFamily }, { data: targetFamily }] = await Promise.all([
    supabase
      .from("families")
      .select("id, user_count")
      .eq("household_id", sourceHouseholdId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("families")
      .select("id, user_count")
      .eq("household_id", targetHouseholdId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (!sourceFamily) return fail("Source family not found")
  if (!targetFamily) return fail("Target family not found")

  const sourceFamilyId = sourceFamily.id
  const targetFamilyId = targetFamily.id

  // 3. Get source profiles for return value
  const { data: sourceProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("family_id", sourceFamilyId)

  const migratedProfileIds = (sourceProfiles ?? []).map((p) => p.id)

  // 4. Reassign all source family data to target family
  await Promise.all([
    supabase
      .from("profiles")
      .update({ family_id: targetFamilyId })
      .eq("family_id", sourceFamilyId),
    supabase
      .from("bank_accounts")
      .update({ family_id: targetFamilyId })
      .eq("family_id", sourceFamilyId),
    supabase
      .from("savings_goals")
      .update({ family_id: targetFamilyId })
      .eq("family_id", sourceFamilyId),
    supabase
      .from("investments")
      .update({ family_id: targetFamilyId })
      .eq("family_id", sourceFamilyId),
    supabase
      .from("prompt_schedule")
      .update({ family_id: targetFamilyId })
      .eq("family_id", sourceFamilyId),
  ])

  // 5. Update target family user_count
  const newUserCount =
    (targetFamily.user_count ?? 1) + (sourceFamily.user_count ?? 1)
  await supabase
    .from("families")
    .update({ user_count: newUserCount })
    .eq("id", targetFamilyId)

  // 6. Copy telegram_chat_id to target household
  if (sourceHousehold.telegram_chat_id) {
    await supabase
      .from("households")
      .update({ telegram_chat_id: sourceHousehold.telegram_chat_id })
      .eq("id", targetHouseholdId)
  }

  // 7. Delete source family and household (order matters for FK constraints)
  await supabase.from("families").delete().eq("id", sourceFamilyId)
  await supabase.from("households").delete().eq("id", sourceHouseholdId)

  return { success: true, migratedProfileIds }
}
