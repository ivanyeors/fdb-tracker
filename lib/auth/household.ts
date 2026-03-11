import { createSupabaseAdmin } from "@/lib/supabase/server"

type HouseholdStage = "config" | "lookup" | "create"

export type GetOrCreateHouseholdResult =
  | {
      ok: true
      householdId: string
      source: "existing" | "created"
    }
  | {
      ok: false
      stage: HouseholdStage
      error: string
      code?: string
    }

export async function getOrCreateHouseholdForChannel(
  chatId: string,
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

  const { data: existing, error: lookupError } = await supabase
    .from("households")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle()

  if (lookupError) {
    return {
      ok: false,
      stage: "lookup",
      error: lookupError.message,
      code: lookupError.code,
    }
  }

  if (existing?.id) {
    return { ok: true, householdId: existing.id, source: "existing" }
  }

  const { data: created, error } = await supabase
    .from("households")
    .insert({ user_count: 1, telegram_chat_id: chatId })
    .select("id")
    .single()

  if (error) {
    return {
      ok: false,
      stage: "create",
      error: error.message,
      code: error.code,
    }
  }

  if (!created?.id) {
    return {
      ok: false,
      stage: "create",
      error: "Supabase did not return a household ID",
    }
  }

  return { ok: true, householdId: created.id, source: "created" }
}
