import { Scenes } from "telegraf"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { MyContext } from "@/lib/telegram/bot"
import { validateApiKey, countLinkedMembers } from "@/lib/auth/api-keys"
import { deterministicHash } from "@/lib/crypto/hash"
import { encodeLinkedTelegramAccountPiiPatch } from "@/lib/repos/linked-telegram-accounts"
import {
  decodeProfilePii,
  encodeProfilePiiPatch,
} from "@/lib/repos/profiles"
import {
  progressHeader,
  errorMsg,
  handleStrayCallback,
} from "@/lib/telegram/scene-helpers"

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const API_KEY_PREFIX = "fdb_"

function isUuid(s: string): boolean {
  return UUID_REGEX.test(s.trim())
}

function isApiKey(s: string): boolean {
  return s.trim().startsWith(API_KEY_PREFIX)
}

const TOTAL_STEPS = 3 // token/key, profile choice, confirm

export const linkApiScene = new Scenes.WizardScene<MyContext>(
  "link_api_wizard",
  async (ctx) => {
    const header = progressHeader(1, TOTAL_STEPS, "Linking profile")
    await ctx.reply(
      `${header}\n\n` +
        "To link your Telegram to a profile, I need either:\n\n" +
        "• A profile token — from Settings → Users (Generate Link Token)\n" +
        "• An API key — from Settings → Setup (Create API Key)\n\n" +
        "Paste whichever you have here.",
    )
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2 (the next handler) handles the post-key callbacks; here we only
    // expect text (token or API key). Bounce stray callbacks pre-key.
    if (
      !ctx.scene.session.apiKeyId &&
      (await handleStrayCallback(ctx, "your profile token or API key"))
    )
      return
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const text = ctx.message.text.trim()

    // If API key was already validated, handle profile choice
    if (ctx.scene.session.apiKeyId) {
      // Handle inline button callbacks
      if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
        return undefined // handled below
      }

      const lower = text.toLowerCase()
      // Fallback for text replies (shouldn't happen with buttons, but keep for compat)
      if (lower === "existing" || lower === "existing profile") {
        return showExistingProfiles(ctx)
      }
      if (lower === "new" || lower === "create new") {
        const header = progressHeader(3, TOTAL_STEPS, "Creating new profile")
        await ctx.reply(
          `${header}\n\nWhat name would you like for the new profile?`,
        )
        ctx.scene.session.expecting = "profile_name"
        return ctx.wizard.next()
      }
      await ctx.reply("Please tap a button above, or reply: existing / new")
      return undefined
    }

    if (isUuid(text)) {
      await handleProfileTokenLink(ctx, text)
      return ctx.scene.leave()
    }

    if (isApiKey(text)) {
      const result = await validateAndStoreApiKey(ctx, text)
      if (!result) return ctx.scene.leave()

      const header = progressHeader(2, TOTAL_STEPS, "Choose how to link")
      await ctx.reply(
        `${header}\n\n` +
          "API key accepted. Would you like to link to an existing profile, or create a new one?",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Link Existing Profile",
                  callback_data: "link_existing",
                },
                {
                  text: "Create New Profile",
                  callback_data: "link_new",
                },
              ],
            ],
          },
        },
      )
      return undefined
    }

    await ctx.reply(
      errorMsg(
        "I didn't recognise that.",
        "Paste a profile token (UUID) from Settings → Users, or an API key (fdb_...) from Settings → Setup.",
      ),
    )
    return undefined
  },
  async (ctx) => {
    const expecting = ctx.scene.session.expecting as string

    // Handle inline buttons for existing/new choice
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()

      if (data === "link_existing") {
        return showExistingProfiles(ctx)
      }

      if (data === "link_new") {
        const header = progressHeader(3, TOTAL_STEPS, "Creating new profile")
        await ctx.reply(
          `${header}\n\nWhat name would you like for the new profile?`,
        )
        ctx.scene.session.expecting = "profile_name"
        return undefined
      }

      if (
        expecting === "profile_select" &&
        data.startsWith("link_profile_")
      ) {
        const profileId = data.replace("link_profile_", "")
        await linkToProfileAndFinish(ctx, profileId)
        return ctx.scene.leave()
      }
    }

    if (
      expecting === "profile_name" &&
      ctx.message &&
      "text" in ctx.message
    ) {
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

async function showExistingProfiles(ctx: MyContext) {
  const profiles = await fetchUnlinkedProfiles(
    ctx.scene.session.householdId as string,
  )
  if (profiles.length === 0) {
    await ctx.reply(
      "No unlinked profiles found. Would you like to create a new one?",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Create New Profile", callback_data: "link_new" }],
          ],
        },
      },
    )
    return undefined
  }
  const buttons = profiles.map((p) => [
    { text: p.name, callback_data: `link_profile_${p.id}` },
  ])

  const header = progressHeader(3, TOTAL_STEPS, "Select a profile")
  await ctx.reply(`${header}\n\nWhich profile would you like to link to?`, {
    reply_markup: { inline_keyboard: buttons },
  })
  ctx.scene.session.expecting = "profile_select"
  return ctx.wizard.next()
}

async function handleProfileTokenLink(
  ctx: MyContext,
  token: string,
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const chatId = ctx.chat?.id
  const fromUserId = ctx.from?.id

  const tokenHash = deterministicHash(token, {
    table: "profiles",
    column: "telegram_link_token_hash",
  })

  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("id, name, family_id")
    .eq("telegram_link_token_hash", tokenHash)
    .maybeSingle()

  if (lookupError || !profile) {
    await ctx.reply(
      errorMsg(
        "That link token doesn't seem valid or may have expired.",
        "Generate a new one in Settings → Users.",
      ),
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

  const profilePiiInput = {
    telegram_chat_id: String(chatId),
    telegram_user_id: String(fromUserId ?? chatId),
    telegram_username: ctx.from?.username ?? null,
  }
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      telegram_chat_id: String(chatId),
      telegram_user_id: String(fromUserId ?? chatId),
      telegram_username: ctx.from?.username ?? null,
      telegram_last_used: new Date().toISOString(),
      ...encodeProfilePiiPatch(profilePiiInput),
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

  await ctx.reply(
    `✅ Done! Your Telegram is now linked to the profile: ${profile.name}`,
  )
}

async function validateAndStoreApiKey(
  ctx: MyContext,
  rawKey: string,
): Promise<boolean> {
  const result = await validateApiKey(rawKey)
  if (!result.ok) {
    await ctx.reply(
      errorMsg(
        "That doesn't look like a valid API key.",
        "Create one in Settings → Setup. Send /link to try again.",
      ),
    )
    return false
  }

  const linkedCount = await countLinkedMembers(result.apiKeyId)
  if (linkedCount >= result.maxMembers) {
    await ctx.reply(
      "❌ This API key has reached its member limit. " +
        "Ask the household admin to create a new key in Settings → Setup.",
    )
    return false
  }

  ctx.scene.session.apiKeyId = result.apiKeyId
  ctx.scene.session.householdId = result.householdId
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
    .select("id, name, name_enc")
    .in("family_id", familyIds)
    .is("telegram_user_id_hash", null)

  return (profiles ?? []).map((p) => ({
    id: p.id,
    name: decodeProfilePii({ name: p.name, name_enc: p.name_enc }).name ?? "",
  }))
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

  const householdId = ctx.scene.session.householdId as string
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

  const profilePiiInput = {
    telegram_chat_id: String(chatId),
    telegram_user_id: String(from.id),
    telegram_username: from.username ?? null,
  }
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      telegram_chat_id: String(chatId),
      telegram_user_id: String(from.id),
      telegram_username: from.username ?? null,
      telegram_last_used: new Date().toISOString(),
      ...encodeProfilePiiPatch(profilePiiInput),
    })
    .eq("id", profileId)

  if (updateErr) {
    await ctx.reply("❌ Failed to link. Please try again.")
    return
  }

  const apiKeyId = ctx.scene.session.apiKeyId as string
  await addToLinkedAccountsIfNeeded(supabase, apiKeyId, householdId, from, chatId)

  await ctx.reply(
    `✅ Done! Your Telegram is now linked to the profile: ${profile.name}`,
  )
}

async function createProfileAndLink(
  ctx: MyContext,
  name: string,
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const chatId = ctx.chat?.id
  const from = ctx.from
  const householdId = ctx.scene.session.householdId as string
  const apiKeyId = ctx.scene.session.apiKeyId as string

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
    await ctx.reply(
      "❌ No family found in this household. Please create one in the platform first.",
    )
    return
  }

  const profilePiiInput = {
    name,
    birth_year: 2000,
    telegram_chat_id: String(chatId),
    telegram_user_id: String(from.id),
    telegram_username: from.username ?? null,
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
      ...encodeProfilePiiPatch(profilePiiInput),
    })
    .select("id, name")
    .single()

  if (createErr || !newProfile) {
    console.error("[link-api-scene] Create profile error:", createErr)
    await ctx.reply("❌ Failed to create profile. Please try again.")
    return
  }

  await addToLinkedAccountsIfNeeded(supabase, apiKeyId, householdId, from, chatId)

  await ctx.reply(
    `✅ Done! Created and linked to the new profile: ${newProfile.name}`,
  )
}

async function addToLinkedAccountsIfNeeded(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  apiKeyId: string | null,
  householdId: string,
  from: { id: number; username?: string },
  chatId: number,
): Promise<void> {
  if (!apiKeyId) return

  const linkedPiiInput = {
    telegram_user_id: String(from.id),
    telegram_username: from.username ?? null,
    telegram_chat_id: String(chatId),
  }
  await supabase.from("linked_telegram_accounts").upsert(
    {
      link_api_key_id: apiKeyId,
      household_id: householdId,
      telegram_user_id: String(from.id),
      telegram_username: from.username ?? null,
      telegram_chat_id: String(chatId),
      ...encodeLinkedTelegramAccountPiiPatch(linkedPiiInput),
    },
    { onConflict: "link_api_key_id,telegram_user_id" },
  )
}
