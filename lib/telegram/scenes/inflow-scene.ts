import { Scenes } from "telegraf"
import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import {
  parseAmountAndMemoFromRest,
  parseCashflowOneLine,
} from "@/lib/telegram/parse-cashflow-command-rest"

export const inflowScene = new Scenes.WizardScene<MyContext>(
  "inflow_wizard",
  async (ctx) => {
    // Step 1: Ask for profile
    const accountId = botState(ctx).accountId as string
    const preProfileId = botState(ctx).profileId
    const preFamilyId = botState(ctx).familyId

    if (!accountId) {
      await ctx.reply("❌ Session error: No account ID found.")
      return ctx.scene.leave()
    }

    const supabase = createSupabaseAdmin()

    // Use pre-resolved family when available (linked Telegram profile)
    const familyIds: string[] = []
    if (preFamilyId) {
      familyIds.push(preFamilyId)
    } else {
      const { data: families, error: familiesError } = await supabase
        .from("families")
        .select("id")
        .eq("household_id", accountId)

      if (familiesError || !families || families.length === 0) {
        await ctx.reply("❌ No family found for this account.")
        return ctx.scene.leave()
      }
      familyIds.push(...families.map((f) => f.id))
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name")
      .in("family_id", familyIds)

    if (profilesError || !profiles || profiles.length === 0) {
      await ctx.reply("❌ No profiles found. Create one in the web dashboard first.")
      return ctx.scene.leave()
    }

    // Auto-select pre-resolved profile if it exists in the fetched profiles
    if (preProfileId) {
      const matched = profiles.find((p) => p.id === preProfileId)
      if (matched) {
        ctx.scene.session.profileId = matched.id
        ctx.scene.session.profileName = matched.name
      }
    }

    const commandRest = botState(ctx).cashflowCommandRest?.trim()
    if (commandRest) {
      delete botState(ctx).cashflowCommandRest
      const one = parseCashflowOneLine(commandRest, profiles)
      if (one) {
        const supabaseOne = createSupabaseAdmin()
        const month = format(startOfMonth(new Date()), "yyyy-MM-dd")
        const monthLabel = format(new Date(), "MMMM yyyy")
        const { error } = await supabaseOne.from("monthly_cashflow").upsert(
          {
            profile_id: one.profileId,
            month,
            inflow: one.amount,
            source: "telegram",
            ...(one.memo != null ? { inflow_memo: one.memo } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,month" },
        )
        if (error) {
          await ctx.reply(`❌ Database error: ${error.message}`)
          return ctx.scene.leave()
        }
        if (one.memo != null) {
          await ctx.reply(
            `✅ Added inflow of $${one.amount} for ${one.profileName} (${monthLabel}).\n📝 Note saved.`,
          )
          return ctx.scene.leave()
        }
        ctx.scene.session.profileId = one.profileId
        ctx.scene.session.profileName = one.profileName
        await ctx.reply(
          `✅ Added inflow of $${one.amount} for ${one.profileName} (${monthLabel}).\n\n💭 Anything to remember for this month? Reply with a short note, or send /skip.`,
        )
        return ctx.wizard.selectStep(3)
      }
      await ctx.reply(
        "ℹ️ Could not parse that message. Try `/in 5000` or `/in YourName 5000 short note`, or continue below.",
      )
    }

    if (profiles.length === 1) {
      // Auto-select if only one profile
      ctx.scene.session.profileId = profiles[0].id
      ctx.scene.session.profileName = profiles[0].name
      await ctx.reply(`Selected profile: ${profiles[0].name}\n\nEnter the inflow amount:`)
      return ctx.wizard.next()
    }

    // Multiple profiles, show inline keyboard
    const buttons = profiles.map((p) => [
      { text: p.name, callback_data: `profile_${p.id}_${p.name}` }
    ])

    await ctx.reply("Select a profile:", {
      reply_markup: {
        inline_keyboard: buttons
      }
    })
    
    // We wait for callback query
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2: Handle profile selection callback or wait for amount if auto-selected
    
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("profile_")) {
        const parts = data.replace("profile_", "").split("_")
        const profileId = parts[0]
        const profileName = parts.slice(1).join("_")
        
        ctx.scene.session.profileId = profileId
        ctx.scene.session.profileName = profileName
        
        await ctx.answerCbQuery()
        await ctx.reply(`Selected profile: ${profileName}\n\nEnter the inflow amount:`)
        return ctx.wizard.next()
      }
    }
    
    // If not a callback, it might be the amount (if profile was auto-selected in step 1)
    if (ctx.scene.session.profileId && ctx.message && "text" in ctx.message) {
       // It's the amount input
       return handleAmountInput(ctx)
    }

    return undefined // Wait for valid input
  },
  async (ctx) => {
    // Step 3: Handle amount input
    return handleAmountInput(ctx)
  },
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined
    const t = ctx.message.text.trim()
    const supabase = createSupabaseAdmin()
    const month = format(startOfMonth(new Date()), "yyyy-MM-dd")

    if (t === "/skip" || t.toLowerCase() === "skip") {
      await ctx.reply("👍 All set!")
      return ctx.scene.leave()
    }

    const memo = t.slice(0, 2000)
    const { error } = await supabase
      .from("monthly_cashflow")
      .update({
        inflow_memo: memo,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", ctx.scene.session.profileId!)
      .eq("month", month)

    if (error) {
      await ctx.reply(`⚠️ Could not save note: ${error.message}`)
    } else {
      await ctx.reply("📝 Note saved.")
    }
    return ctx.scene.leave()
  },
)

async function handleAmountInput(ctx: MyContext) {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const text = ctx.message.text.trim()
    const parsed = parseAmountAndMemoFromRest(text)
    if (!parsed) {
      await ctx.reply(
        "❌ Invalid amount. Enter a positive number, optionally followed by a short note (e.g. `5000 salary`).",
      )
      return undefined
    }

    const { amount, memo } = parsed

    // Save to DB
    const supabase = createSupabaseAdmin()
    const month = format(startOfMonth(new Date()), "yyyy-MM-dd")
    const monthLabel = format(new Date(), "MMMM yyyy")

    const { error } = await supabase.from("monthly_cashflow").upsert(
      {
        profile_id: ctx.scene.session.profileId!,
        month,
        inflow: amount,
        source: "telegram",
        ...(memo != null ? { inflow_memo: memo } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,month" },
    )

    if (error) {
       await ctx.reply(`❌ Database error: ${error.message}`)
       return ctx.scene.leave()
    }

    if (memo != null) {
      await ctx.reply(
        `✅ Added inflow of $${amount} for ${ctx.scene.session.profileName} (${monthLabel}).\n📝 Note saved.`,
      )
      return ctx.scene.leave()
    }

    await ctx.reply(
      `✅ Added inflow of $${amount} for ${ctx.scene.session.profileName} (${monthLabel}).\n\n💭 Anything to remember for this month? Reply with a short note, or send /skip.`,
    )
    return ctx.wizard.next()
}
