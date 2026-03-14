import type { SupabaseClient } from "@supabase/supabase-js"

export async function resolveFamilyAndProfiles(
  supabase: SupabaseClient,
  accountId: string,
  profileId: string | null,
  familyId: string | null
): Promise<{ familyId: string; profileIds: string[] } | null> {
  if (profileId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("family_id")
      .eq("id", profileId)
      .single()
    if (!profile) return null
    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", profile.family_id)
      .eq("household_id", accountId)
      .single()
    if (!family) return null
    return { familyId: family.id, profileIds: [profileId] }
  }
  let targetFamilyId = familyId
  if (!targetFamilyId) {
    const { data: first } = await supabase
      .from("families")
      .select("id")
      .eq("household_id", accountId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single()
    targetFamilyId = first?.id ?? null
  }
  if (!targetFamilyId) return null
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", targetFamilyId)
    .eq("household_id", accountId)
    .single()
  if (!family) return null
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("family_id", family.id)
  return {
    familyId: family.id,
    profileIds: profiles?.map((p) => p.id) ?? [],
  }
}
