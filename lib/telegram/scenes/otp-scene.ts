import { Scenes } from "telegraf"
import { botState, MyContext } from "@/lib/telegram/bot"
import { generateAndStoreOtp } from "@/lib/auth/otp"
import {
  getHouseholdFromTelegramUsername,
  getOrCreateAccount,
} from "@/lib/telegram/resolve-household"

export const otpScene = new Scenes.WizardScene<MyContext>(
  "otp_wizard",
  async (ctx) => {
    await ctx.reply(
      "I couldn't find your account. What's your Telegram username? (e.g. @johndoe)",
    )
    return ctx.wizard.next()
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const username = ctx.message.text.trim()
    const chatId = botState(ctx).otpChatId as string

    if (!chatId) {
      await ctx.reply("❌ Session error. Please send /otp again.")
      return ctx.scene.leave()
    }

    let householdId = await getHouseholdFromTelegramUsername(username)

    if (!householdId) {
      householdId = await getOrCreateAccount(chatId)
      if (!householdId) {
        await ctx.reply("❌ Something went wrong. Please try again.")
        return ctx.scene.leave()
      }

      const result = await generateAndStoreOtp(householdId)
      if (!result.ok) {
        await ctx.reply(`❌ ${result.error}`)
        return ctx.scene.leave()
      }

      await ctx.reply(
        `${result.otp}\n\n` +
          "You're new here! Use this code to log in on the web and complete onboarding. " +
          "After that you can use /link to connect your profile.",
      )
      return ctx.scene.leave()
    }

    const result = await generateAndStoreOtp(householdId)
    if (!result.ok) {
      await ctx.reply(`❌ ${result.error}`)
      return ctx.scene.leave()
    }

    await ctx.reply(`${result.otp}`)
    return ctx.scene.leave()
  },
)
