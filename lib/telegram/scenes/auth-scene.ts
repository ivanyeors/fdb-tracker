import { Scenes } from "telegraf"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { MyContext } from "@/lib/telegram/bot"
import { validateApiKey, countLinkedMembers } from "@/lib/auth/api-keys"
import { encodeLinkedTelegramAccountPiiPatch } from "@/lib/repos/linked-telegram-accounts"
import { progressHeader, errorMsg } from "@/lib/telegram/scene-helpers"

const TOTAL_STEPS = 2 // key, confirm

export const authScene = new Scenes.WizardScene<MyContext>(
  "auth_wizard",
  async (ctx) => {
    const header = progressHeader(1, TOTAL_STEPS, "Linking Telegram account")
    await ctx.reply(
      `${header}\n\n` +
        "To link your Telegram account to the platform, I'll need your API key.\n\n" +
        "You can create one in the platform under Settings → Setup. " +
        "Copy the key and paste it here when you're ready.",
    )
    return ctx.wizard.next()
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const rawKey = ctx.message.text.trim()
    const result = await validateApiKey(rawKey)

    if (!result.ok) {
      await ctx.reply(
        errorMsg(
          "That doesn't look like a valid API key.",
          "Paste the key from Settings → Setup. Send /auth to start over.",
        ),
      )
      return ctx.scene.leave()
    }

    const linkedCount = await countLinkedMembers(result.apiKeyId)
    if (linkedCount >= result.maxMembers) {
      await ctx.reply(
        "❌ This API key has reached its member limit. " +
          "Ask the household admin to create a new key or increase the limit in Settings → Setup.",
      )
      return ctx.scene.leave()
    }

    ctx.scene.session.apiKeyId = result.apiKeyId
    ctx.scene.session.householdId = result.householdId

    const from = ctx.from
    const userId = from?.id ?? 0
    const username = from?.username
    const display =
      username ? `@${username} (ID: ${userId})` : `user_${userId}`

    const header = progressHeader(2, TOTAL_STEPS, "Confirm account link")
    await ctx.reply(
      `${header}\n\n` +
        `I'll link this Telegram account (${display}) to the household.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Link Account", callback_data: "cf" },
              { text: "❌ Cancel", callback_data: "cn" },
            ],
          ],
        },
      },
    )
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Handle inline button or text fallback
    let confirmed: boolean | null = null

    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()
      if (data === "cf") confirmed = true
      if (data === "cn") confirmed = false
    }

    if (confirmed === null && ctx.message && "text" in ctx.message) {
      const text = ctx.message.text.trim().toLowerCase()
      if (text === "yes" || text === "y") confirmed = true
      else if (text === "no" || text === "n") confirmed = false
      else {
        await ctx.reply("Tap a button above, or reply Yes / No.")
        return undefined
      }
    }

    if (confirmed === null) return undefined

    if (!confirmed) {
      await ctx.reply(
        "No problem. Link cancelled. Send /auth anytime to try again.",
      )
      return ctx.scene.leave()
    }

    const apiKeyId = ctx.scene.session.apiKeyId as string
    const householdId = ctx.scene.session.householdId as string
    const from = ctx.from
    const chat = ctx.chat

    if (!from || !chat) {
      await ctx.reply("❌ Could not resolve your account. Please try again.")
      return ctx.scene.leave()
    }

    const supabase = createSupabaseAdmin()
    const linkedPiiInput = {
      telegram_user_id: String(from.id),
      telegram_username: from.username ?? null,
      telegram_chat_id: String(chat.id),
    }
    const { error } = await supabase.from("linked_telegram_accounts").upsert(
      {
        link_api_key_id: apiKeyId,
        household_id: householdId,
        telegram_user_id: String(from.id),
        telegram_username: from.username ?? null,
        telegram_chat_id: String(chat.id),
        ...encodeLinkedTelegramAccountPiiPatch(linkedPiiInput),
      },
      {
        onConflict: "link_api_key_id,telegram_user_id",
      },
    )

    if (error) {
      console.error("[auth-scene] Insert error:", error)
      await ctx.reply("❌ Failed to link account. Please try again.")
      return ctx.scene.leave()
    }

    await ctx.reply(
      "✅ Done! Your account is now linked. " +
        "You can use /otp anytime to get a login code for this household.",
    )
    return ctx.scene.leave()
  },
)
