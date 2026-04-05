import { Scenes } from "telegraf"
import { MyContext, botState } from "@/lib/telegram/bot"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { validateCode, markCodeUsed } from "@/lib/auth/signup-codes"
import { generateAndStoreOtp } from "@/lib/auth/otp"
import { progressHeader, errorMsg } from "@/lib/telegram/scene-helpers"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""
const TOTAL_STEPS = 3

export const joinScene = new Scenes.WizardScene<MyContext>(
  "join_wizard",
  // Step 1: Ask for invite code (skipped if from deep link)
  async (ctx) => {
    const header = progressHeader(1, TOTAL_STEPS, "Join household")
    await ctx.reply(`${header}\n\nPaste your invite code:`)
    return ctx.wizard.next()
  },
  // Step 2: Validate code and show profile options
  async (ctx) => {
    // Handle callback from profile selection (forwarded from step 3)
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      return handleProfileCallback(ctx)
    }

    let code = botState(ctx).joinCode

    if (!code) {
      if (!ctx.message || !("text" in ctx.message)) return undefined
      code = ctx.message.text.trim()
    }

    if (!code) {
      await ctx.reply(errorMsg("Please enter a valid code."))
      return undefined
    }

    const result = await validateCode(code)

    if (!result.ok) {
      const hint =
        result.error === "This code has expired."
          ? `This code has expired. Ask your household admin for a new invite code.`
          : result.error
      await ctx.reply(errorMsg(hint))
      return ctx.scene.leave()
    }

    if (result.type !== "invite") {
      await ctx.reply(
        "This looks like a signup code. Use /signup to create a new account."
      )
      return ctx.scene.leave()
    }

    if (!result.householdId) {
      await ctx.reply(errorMsg("Invalid invite code."))
      return ctx.scene.leave()
    }

    // Store code data in session
    ctx.scene.session.householdId = result.householdId
    ctx.scene.session.expecting = result.id // store code ID

    // If target profile is pre-selected, auto-link
    if (result.targetProfileId) {
      const supabase = createSupabaseAdmin()
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, telegram_user_id")
        .eq("id", result.targetProfileId)
        .single()

      if (profile && !profile.telegram_user_id) {
        await showConfirmation(ctx, profile.id, profile.name)
        return ctx.wizard.next()
      }
      // If pre-selected profile is already linked, fall through to picker
    }

    await showProfilePicker(ctx, result.householdId)
    return ctx.wizard.next()
  },
  // Step 3: Handle profile selection and link
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      return handleProfileCallback(ctx)
    }

    // Handle text input for new profile name
    if (
      ctx.scene.session.expecting === "profile_name" &&
      ctx.message &&
      "text" in ctx.message
    ) {
      const name = ctx.message.text.trim()
      if (!name) {
        await ctx.reply("Please enter a valid name.")
        return undefined
      }
      await createProfileAndLink(ctx, name)
      return ctx.scene.leave()
    }

    return undefined
  }
)

async function showProfilePicker(ctx: MyContext, householdId: string) {
  const supabase = createSupabaseAdmin()
  const { data: families } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", householdId)

  const familyIds = families?.map((f) => f.id) ?? []
  let profiles: Array<{ id: string; name: string }> = []

  if (familyIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, name")
      .in("family_id", familyIds)
      .is("telegram_user_id", null)
    profiles = data ?? []
  }

  const buttons = profiles.map((p) => [
    { text: p.name, callback_data: `join_profile_${p.id}` },
  ])
  buttons.push([{ text: "Create New Profile", callback_data: "join_new" }])

  const header = progressHeader(2, TOTAL_STEPS, "Choose a profile")

  if (profiles.length === 0) {
    await ctx.reply(
      `${header}\n\nNo unlinked profiles found. Would you like to create a new one?`,
      { reply_markup: { inline_keyboard: buttons } }
    )
  } else {
    await ctx.reply(`${header}\n\nWhich profile would you like to link to?`, {
      reply_markup: { inline_keyboard: buttons },
    })
  }
}

async function showConfirmation(
  ctx: MyContext,
  profileId: string,
  profileName: string
) {
  const header = progressHeader(3, TOTAL_STEPS, "Confirm linking")
  ctx.scene.session.profileId = profileId
  ctx.scene.session.profileName = profileName

  await ctx.reply(
    `${header}\n\nLink your Telegram to profile: ${profileName}?`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: "join_confirm" },
            { text: "🔄 Choose Another", callback_data: "join_reselect" },
            { text: "❌ Cancel", callback_data: "join_cancel" },
          ],
        ],
      },
    }
  )
}

async function handleProfileCallback(ctx: MyContext) {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return undefined
  const data = ctx.callbackQuery.data
  await ctx.answerCbQuery()

  if (data === "join_new") {
    const header = progressHeader(3, TOTAL_STEPS, "Create new profile")
    await ctx.reply(
      `${header}\n\nWhat name would you like for the new profile?`
    )
    ctx.scene.session.expecting = "profile_name"
    return undefined
  }

  if (data.startsWith("join_profile_")) {
    const profileId = data.replace("join_profile_", "")
    const supabase = createSupabaseAdmin()
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, telegram_user_id")
      .eq("id", profileId)
      .single()

    if (!profile) {
      await ctx.reply(errorMsg("Profile not found."))
      return ctx.scene.leave()
    }

    if (profile.telegram_user_id) {
      await ctx.reply(
        "This profile is already linked to another Telegram account. Please choose another."
      )
      await showProfilePicker(ctx, ctx.scene.session.householdId as string)
      return undefined
    }

    await showConfirmation(ctx, profile.id, profile.name)
    return undefined
  }

  if (data === "join_confirm") {
    const profileId = ctx.scene.session.profileId as string
    if (!profileId) {
      await ctx.reply(errorMsg("No profile selected."))
      return ctx.scene.leave()
    }
    await linkProfileAndFinish(ctx, profileId)
    return ctx.scene.leave()
  }

  if (data === "join_reselect") {
    await showProfilePicker(ctx, ctx.scene.session.householdId as string)
    return undefined
  }

  if (data === "join_cancel") {
    await ctx.reply("Cancelled.")
    return ctx.scene.leave()
  }

  return undefined
}

async function linkProfileAndFinish(ctx: MyContext, profileId: string) {
  const supabase = createSupabaseAdmin()
  const chatId = ctx.chat?.id
  const from = ctx.from
  const householdId = ctx.scene.session.householdId as string
  const codeId = ctx.scene.session.expecting as string

  if (!chatId || !from) {
    await ctx.reply(errorMsg("Could not resolve your Telegram account."))
    return
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      telegram_chat_id: String(chatId),
      telegram_user_id: String(from.id),
      telegram_username: from.username
        ? from.username.replace(/^@/, "").toLowerCase()
        : null,
      telegram_last_used: new Date().toISOString(),
    })
    .eq("id", profileId)

  if (updateErr) {
    await ctx.reply(errorMsg("Failed to link profile. Please try again."))
    return
  }

  // Mark invite code as used
  await markCodeUsed(codeId, String(from.id))

  // Generate OTP for first login
  const otpResult = await generateAndStoreOtp(householdId)
  if (!otpResult.ok) {
    await ctx.reply(
      `✅ Profile linked! But failed to generate login code: ${otpResult.error}\n\nUse /otp to get a login code.`
    )
    return
  }

  const profileName = ctx.scene.session.profileName ?? "your profile"
  await ctx.reply(
    `✅ Linked to profile: ${profileName}\n\n` +
      `Your login code: ${otpResult.otp}\n\n` +
      `Enter this code at ${APP_URL}/login to sign in.\n` +
      `The code expires in 5 minutes.`
  )
}

async function createProfileAndLink(ctx: MyContext, name: string) {
  const supabase = createSupabaseAdmin()
  const chatId = ctx.chat?.id
  const from = ctx.from
  const householdId = ctx.scene.session.householdId as string
  const codeId = ctx.scene.session.expecting as string

  if (!chatId || !from) {
    await ctx.reply(errorMsg("Could not resolve your Telegram account."))
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
    await ctx.reply(errorMsg("No family found in this household."))
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
      telegram_username: from.username
        ? from.username.replace(/^@/, "").toLowerCase()
        : null,
      telegram_last_used: new Date().toISOString(),
    })
    .select("id, name")
    .single()

  if (createErr || !newProfile) {
    console.error("[join-scene] Create profile error:", createErr)
    await ctx.reply(errorMsg("Failed to create profile. Please try again."))
    return
  }

  // Mark invite code as used
  await markCodeUsed(codeId, String(from.id))

  // Generate OTP for first login
  const otpResult = await generateAndStoreOtp(householdId)
  if (!otpResult.ok) {
    await ctx.reply(
      `✅ Created and linked to: ${newProfile.name}\n\nBut failed to generate login code. Use /otp to get a code.`
    )
    return
  }

  await ctx.reply(
    `✅ Created and linked to: ${newProfile.name}\n\n` +
      `Your login code: ${otpResult.otp}\n\n` +
      `Enter this code at ${APP_URL}/login to sign in.\n` +
      `The code expires in 5 minutes.`
  )
}
