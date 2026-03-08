import { createSupabaseAdmin } from "@/lib/supabase/server"

type ResolvedUser = { profileId: string; profileName: string }
type ResolveError = { error: string }

export async function resolveUser(
  nameOrArgs: string,
  householdId: string,
): Promise<ResolvedUser | ResolveError> {
  const supabase = createSupabaseAdmin()

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("household_id", householdId)

  if (error) {
    return { error: `Database error: ${error.message}` }
  }

  if (!profiles || profiles.length === 0) {
    return { error: "No profiles found for this household." }
  }

  const trimmed = nameOrArgs.trim()

  if (profiles.length === 1 && trimmed === "") {
    return { profileId: profiles[0].id, profileName: profiles[0].name }
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

  return { profileId: match.id, profileName: match.name }
}
