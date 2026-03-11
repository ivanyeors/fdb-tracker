import { createSupabaseAdmin } from "@/lib/supabase/server"

type AccountStage = "config" | "lookup" | "create"

export type GetOrCreateAccountResult =
  | {
      ok: true
      accountId: string
      source: "existing" | "created"
    }
  | {
      ok: false
      stage: AccountStage
      error: string
      code?: string
    }

/**
 * Gets or creates an account for a Telegram chat. Each chat gets one account.
 * When creating, also creates a default profile so /in and other commands work.
 */
export async function getOrCreateAccountForChat(
  chatId: string,
): Promise<GetOrCreateAccountResult> {
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
    return { ok: true, accountId: existing.id, source: "existing" }
  }

  const { data: created, error } = await supabase
    .from("households")
    .insert({
      user_count: 1,
      telegram_chat_id: chatId,
      onboarding_completed_at: new Date().toISOString(),
    })
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
      error: "Supabase did not return an account ID",
    }
  }

  // Create default profile so /in and other commands work immediately
  const { error: profileError } = await supabase.from("profiles").insert({
    household_id: created.id,
    name: "Me",
    birth_year: 1990,
  })

  if (profileError) {
    console.error("[account] Failed to create default profile:", profileError)
    // Account was created; profile can be added via onboarding later
  }

  return { ok: true, accountId: created.id, source: "created" }
}
