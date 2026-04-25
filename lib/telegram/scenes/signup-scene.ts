import { Scenes } from "telegraf"
import { MyContext, botState } from "@/lib/telegram/bot"
import { encodeFamilyPiiPatch } from "@/lib/repos/families"
import { encodeHouseholdPiiPatch } from "@/lib/repos/households"
import {
  encodeProfilePiiPatch,
  hashProfileTelegramChatId,
  hashProfileTelegramUserId,
} from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { validateCode, markCodeUsed } from "@/lib/auth/signup-codes"
import { generateAndStoreOtp } from "@/lib/auth/otp"
import {
  progressHeader,
  errorMsg,
  handleStrayCallback,
} from "@/lib/telegram/scene-helpers"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""
const TOTAL_STEPS = 2

export const signupScene = new Scenes.WizardScene<MyContext>(
  "signup_wizard",
  // Step 0: Ask for signup code — or auto-process if from deep link
  async (ctx) => {
    const deepLinkCode = botState(ctx).signupCode
    if (deepLinkCode) {
      // Deep link: validate and create account immediately
      const result = await processSignupCode(ctx, deepLinkCode)
      if (result === "leave") return ctx.scene.leave()
      return ctx.scene.leave() // always leave after processing
    }

    const header = progressHeader(1, TOTAL_STEPS, "Sign up")
    await ctx.reply(
      `${header}\n\nPaste your 8-character signup code from the website:`
    )
    return ctx.wizard.next()
  },
  // Step 1: Receive typed code, validate and create account
  async (ctx) => {
    if (await handleStrayCallback(ctx, "your 8-character signup code")) return
    if (!ctx.message || !("text" in ctx.message)) return undefined
    const code = ctx.message.text.trim()

    if (!code) {
      await ctx.reply(errorMsg("Please enter a valid code."))
      return undefined
    }

    await processSignupCode(ctx, code)
    return ctx.scene.leave()
  }
)

/**
 * Shared logic: validate signup code, create account, send OTP.
 * Returns "leave" on error/success (caller should always leave scene after).
 */
async function processSignupCode(
  ctx: MyContext,
  code: string
): Promise<"leave"> {
  const result = await validateCode(code)

  if (!result.ok) {
    const hint =
      result.error === "This code has expired."
        ? `This code has expired. Please generate a new one at ${APP_URL}/login.`
        : result.error
    await ctx.reply(errorMsg(hint))
    return "leave"
  }

  if (result.type !== "signup") {
    await ctx.reply(
      "This looks like an invite code. Use /join to join an existing household."
    )
    return "leave"
  }

  const chatId = ctx.chat?.id
  const from = ctx.from
  if (!chatId || !from) {
    await ctx.reply(errorMsg("Could not resolve your Telegram account."))
    return "leave"
  }

  const fromUserId = String(from.id)
  const supabase = createSupabaseAdmin()

  // Check if user already has an owner account
  const chatIdHash = hashProfileTelegramChatId(String(chatId))
  const userIdHash = hashProfileTelegramUserId(fromUserId)
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, family_id")
    .or(`telegram_chat_id_hash.eq.${chatIdHash},telegram_user_id_hash.eq.${userIdHash}`)
    .limit(1)
    .maybeSingle()

  if (existingProfile) {
    const { data: family } = await supabase
      .from("families")
      .select("household_id")
      .eq("id", existingProfile.family_id)
      .single()

    if (family) {
      const { data: household } = await supabase
        .from("households")
        .select("account_type")
        .eq("id", family.household_id)
        .single()

      if (household?.account_type === "owner") {
        await ctx.reply(
          "You already have an account. Use /otp to get a login code."
        )
        return "leave"
      }

      // Convert public account to owner
      await supabase
        .from("households")
        .update({
          account_type: "owner",
          onboarding_completed_at: null,
        })
        .eq("id", family.household_id)

      const marked = await markCodeUsed(result.id, fromUserId)
      if (!marked) {
        await ctx.reply(errorMsg("This code has already been used."))
        return "leave"
      }

      const otpResult = await generateAndStoreOtp(family.household_id)
      if (!otpResult.ok) {
        await ctx.reply(errorMsg(otpResult.error))
        return "leave"
      }

      await ctx.reply(
        `✅ Account upgraded!\n\n` +
          `Your login code: ${otpResult.otp}\n\n` +
          `Enter this code at ${APP_URL}/login to complete onboarding.`
      )
      return "leave"
    }
  }

  // Create new owner household + family + profile
  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({
      user_count: 1,
      telegram_chat_id: String(chatId),
      ...encodeHouseholdPiiPatch({ telegram_chat_id: String(chatId) }),
      account_type: "owner",
    })
    .select("id")
    .single()

  if (householdError || !household) {
    console.error("[signup-scene] Household creation failed:", householdError)
    await ctx.reply(errorMsg("Failed to create account. Please try again."))
    return "leave"
  }

  const { data: family, error: familyError } = await supabase
    .from("families")
    .insert({
      household_id: household.id,
      name: "Family 1",
      ...encodeFamilyPiiPatch({ name: "Family 1" }),
      user_count: 1,
    })
    .select("id")
    .single()

  if (familyError || !family) {
    console.error("[signup-scene] Family creation failed:", familyError)
    await ctx.reply(errorMsg("Failed to create account. Please try again."))
    return "leave"
  }

  const displayName = from.first_name || from.username || "User"
  const profilePiiInput = {
    name: displayName,
    birth_year: 2000,
    telegram_user_id: fromUserId,
    telegram_chat_id: String(chatId),
    telegram_username: from.username ?? null,
  }
  const { error: profileError } = await supabase.from("profiles").insert({
    family_id: family.id,
    name: displayName,
    birth_year: 2000,
    telegram_user_id: fromUserId,
    telegram_chat_id: String(chatId),
    telegram_username: from.username
      ? from.username.replace(/^@/, "").toLowerCase()
      : null,
    telegram_last_used: new Date().toISOString(),
    ...encodeProfilePiiPatch(profilePiiInput),
  })

  if (profileError) {
    console.error("[signup-scene] Profile creation failed:", profileError)
    await ctx.reply(errorMsg("Failed to create profile. Please try again."))
    return "leave"
  }

  const marked = await markCodeUsed(result.id, fromUserId)
  if (!marked) {
    await ctx.reply(errorMsg("This code has already been used."))
    return "leave"
  }

  const otpResult = await generateAndStoreOtp(household.id)
  if (!otpResult.ok) {
    await ctx.reply(errorMsg(otpResult.error))
    return "leave"
  }

  await ctx.reply(
    `✅ Account created!\n\n` +
      `Your login code: ${otpResult.otp}\n\n` +
      `Enter this code at ${APP_URL}/login to complete onboarding.\n` +
      `The code expires in 5 minutes.`
  )
  return "leave"
}
