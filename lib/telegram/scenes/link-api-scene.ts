import { Scenes } from "telegraf"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { MyContext } from "@/lib/telegram/bot"
import {
  validateApiKey,
  countLinkedMembers,
} from "@/lib/auth/api-keys"

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const API_KEY_PREFIX = "fdb_"

function isUuid(s: string): boolean {
  return UUID_REGEX.test(s.trim())
}

function isApiKey(s: string): boolean {
  return s.trim().startsWith(API_KEY_PREFIX)
}

export const linkApiScene = new Scenes.WizardScene<MyContext>(
  "link_api_wizard",
  async (ctx) => {
    await ctx.reply(
      "To link your Telegram to a profile, I need either:\n\n" +
        "• A profile token — from Settings → Users in the platform (Generate Link Token)\n" +
        "• An API key — from Settings → Setup (Create API Key)\n\n" +
        "Paste whichever you have here when you're ready.",
    )
    return ctx.wizard.next()
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const text = ctx.message.text.trim()

    if ((ctx.scene.session as any).apiKeyId) {
      const lower = text.toLowerCase()
      if (lower === "existing" || lower === "existing profile") {
        const profiles = await fetchUnlinkedProfiles(
          (ctx.scene.session as any).householdId,
        )
        if (profiles.length === 0) {
          await ctx.reply(
            "There are no unlinked profiles yet. Would you like to create a new one? Reply: new",
          )
          return undefined
        }
        const buttons = profiles.map((p) => [
          {
            text: p.name,
            callback_data: `link_profile_${p.id}`,
          },
        ])
        await ctx.reply("Which profile would you like to link to?", {
          reply_markup: { inline_keyboard: buttons },
        })
        ;(ctx.scene.session as any).expecting = "profile_select"
        return ctx.wizard.next()
      }
      if (lower === "new" || lower === "create new") {
        await ctx.reply("What name would you like for the new profile?")
        ;(ctx.scene.session as any).expecting = "profile_name"
        return ctx.wizard.next()
      }
      await ctx.reply('Reply "existing" to link to an existing profile, or "new" to create one.')
      return undefined
    }

    if (isUuid(text)) {
      await handleProfileTokenLink(ctx, text)
      return ctx.scene.leave()
    }
    if (isApiKey(text)) {
      const result = await validateAndStoreApiKey(ctx, text)
      if (!result) return ctx.scene.leave()
      await ctx.reply(
        "API key accepted. Would you like to link to an existing profile, or create a new one? Reply: existing / new",
      )
      return undefined
    }

    await ctx.reply(
      "I didn't recognise that. Please paste either a profile token (from Settings → Users) or an API key (from Settings → Setup).",
    )
    return undefined
  },
  async (ctx) => {
    const expecting = (ctx.scene.session as any).expecting as string

    if (expecting === "profile_select" && ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("link_profile_")) {
        const profileId = data.replace("link_profile_", "")
        await ctx.answerCbQuery()
        await linkToProfileAndFinish(ctx, profileId)
        return ctx.scene.leave()
      }
    }

    if (expecting === "profile_name" && ctx.message && "text" in ctx.message) {
      const name = ctx.message.text.trim()
      if (!name) {
        await ctx.reply("Please enter a valid profile name.")
        return undefined
      }
      await createProfileAndLink(ctx, name)
      return ctx.scene.leave()
    }

    return undefined
  },
)

async function handleProfileTokenLink(
  ctx: MyContext,
  token: string,
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const chatId = ctx.chat?.id
  const fromUserId = ctx.from?.id

  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("id, name, family_id")
    .eq("telegram_link_token", token)
    .maybeSingle()

  if (lookupError || !profile) {
    await ctx.reply(
      "That link token doesn't seem valid or may have expired. " +
        "Generate a new one in Settings → Users on the platform.",
    )
    return
  }

  const { data: family } = await supabase
    .from("families")
    .select("household_id")
    .eq("id", profile.family_id)
    .single()

  const householdId = family?.household_id
  if (!householdId || !chatId) {
    await ctx.reply("❌ Failed to link. Please try again.")
    return
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      telegram_chat_id: String(chatId),
      telegram_user_id: String(fromUserId ?? chatId),
      telegram_username: ctx.from?.username ?? null,
      telegram_last_used: new Date().toISOString(),
    })
    .eq("id", profile.id)

  if (updateError) {
    await ctx.reply("❌ Failed to link account. Please try again.")
    return
  }

  if (ctx.from) {
    await addToLinkedAccountsIfNeeded(
      supabase,
      null,
      householdId,
      ctx.from,
      chatId,
    )
  }

  await ctx.reply(`Done! Your Telegram is now linked to the profile: ${profile.name}`)
}

async function validateAndStoreApiKey(
  ctx: MyContext,
  rawKey: string,
): Promise<boolean> {
  const result = await validateApiKey(rawKey)
  if (!result.ok) {
    await ctx.reply(
      "That doesn't look like a valid API key. " +
        "Create one in Settings → Setup on the platform. Send /link to try again.",
    )
    return false
  }

  const linkedCount = await countLinkedMembers(result.apiKeyId)
  if (linkedCount >= result.maxMembers) {
    await ctx.reply(
      "This API key has reached its member limit. " +
        "Ask the household admin to create a new key in Settings → Setup.",
    )
    return false
  }

  ;(ctx.scene.session as any).apiKeyId = result.apiKeyId
  ;(ctx.scene.session as any).householdId = result.householdId
  return true
}

async function fetchUnlinkedProfiles(householdId: string) {
  const supabase = createSupabaseAdmin()
  const { data: families } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", householdId)

  if (!families?.length) return []

  const familyIds = families.map((f) => f.id)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .in("family_id", familyIds)
    .is("telegram_user_id", null)

  return profiles ?? []
}

async function linkToProfileAndFinish(
  ctx: MyContext,
  profileId: string,
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const chatId = ctx.chat?.id
  const from = ctx.from
  if (!chatId || !from) {
    await ctx.reply("❌ Could not resolve your account.")
    return
  }

  const { data: profile, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, name, family_id")
    .eq("id", profileId)
    .single()

  if (fetchErr || !profile) {
    await ctx.reply("❌ Profile not found.")
    return
  }

  const householdId = (ctx.scene.session as any).householdId as string
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("id", profile.family_id)
    .eq("household_id", householdId)
    .single()

  if (!family) {
    await ctx.reply("❌ Profile not in this household.")
    return
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      telegram_chat_id: String(chatId),
      telegram_user_id: String(from.id),
      telegram_username: from.username ?? null,
      telegram_last_used: new Date().toISOString(),
    })
    .eq("id", profileId)

  if (updateErr) {
    await ctx.reply("❌ Failed to link. Please try again.")
    return
  }

  const apiKeyId = (ctx.scene.session as any).apiKeyId as string
  await addToLinkedAccountsIfNeeded(
    supabase,
    apiKeyId,
    householdId,
    from,
    chatId,
  )

  await ctx.reply(`Done! Your Telegram is now linked to the profile: ${profile.name}`)
}

async function createProfileAndLink(ctx: MyContext, name: string): Promise<void> {
  const supabase = createSupabaseAdmin()
  const chatId = ctx.chat?.id
  const from = ctx.from
  const householdId = (ctx.scene.session as any).householdId as string
  const apiKeyId = (ctx.scene.session as any).apiKeyId as string

  if (!chatId || !from) {
    await ctx.reply("❌ Could not resolve your account.")
    return
  }

  const { data: firstFamily } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single()

  if (!firstFamily) {
    await ctx.reply("❌ No family found in this household. Please create one in the platform first.")
    return
  }

  const { data: newProfile, error: createErr } = await supabase
    .from("profiles")
    .insert({
      family_id: firstFamily.id,
      name,
      birth_year: 2000,
      telegram_chat_id: String(chatId),
      telegram_user_id: String(from.id),
      telegram_username: from.username ?? null,
      telegram_last_used: new Date().toISOString(),
    })
    .select("id, name")
    .single()

  if (createErr || !newProfile) {
    console.error("[link-api-scene] Create profile error:", createErr)
    await ctx.reply("❌ Failed to create profile. Please try again.")
    return
  }

  await addToLinkedAccountsIfNeeded(
    supabase,
    apiKeyId,
    householdId,
    from,
    chatId,
  )

  await ctx.reply(`Done! Created and linked to the new profile: ${newProfile.name}`)
}

async function addToLinkedAccountsIfNeeded(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  apiKeyId: string | null,
  householdId: string,
  from: { id: number; username?: string },
  chatId: number,
): Promise<void> {
  if (!apiKeyId) return

  await supabase.from("linked_telegram_accounts").upsert(
    {
      link_api_key_id: apiKeyId,
      household_id: householdId,
      telegram_user_id: String(from.id),
      telegram_username: from.username ?? null,
      telegram_chat_id: String(chatId),
    },
    { onConflict: "link_api_key_id,telegram_user_id" },
  )
}
