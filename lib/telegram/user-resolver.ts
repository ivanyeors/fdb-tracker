import { createSupabaseAdmin } from "@/lib/supabase/server"

type ResolvedUser = { profileId: string; profileName: string; familyId: string }
type ResolveError = { error: string }

export async function resolveUser(
  nameOrArgs: string,
  accountId: string,
): Promise<ResolvedUser | ResolveError> {
  const supabase = createSupabaseAdmin()

  const { data: families } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", accountId)

  const familyIds = families?.map((f) => f.id) ?? []
  if (familyIds.length === 0) {
    return { error: "No families found. Complete onboarding first." }
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name, family_id")
    .in("family_id", familyIds)

  if (error) {
    return { error: `Database error: ${error.message}` }
  }

  if (!profiles || profiles.length === 0) {
    return { error: "No profiles found. Complete onboarding first." }
  }

  const trimmed = nameOrArgs.trim()

  if (profiles.length === 1 && trimmed === "") {
    return {
      profileId: profiles[0].id,
      profileName: profiles[0].name,
      familyId: profiles[0].family_id,
    }
  }

  if (trimmed === "") {
    const names = profiles.map((p) => p.name).join(", ")
    return { error: `Please specify a name. Known users: ${names}.` }
  }

  const match = profiles.find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
  )

  if (!match) {
    const names = profiles.map((p) => p.name).join(", ")
    return { error: `Unknown user '${trimmed}'. Known users: ${names}.` }
  }

  return {
    profileId: match.id,
    profileName: match.name,
    familyId: match.family_id,
  }
}
