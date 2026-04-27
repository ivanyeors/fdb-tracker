import { Scenes } from "telegraf"

import { encodeTaxGiroSchedulePiiPatch } from "@/lib/repos/tax-giro-schedule"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import {
  progressHeader,
  errorMsg,
  fmtAmt,
} from "@/lib/telegram/scene-helpers"
import { calculateGiroSchedule } from "@/lib/calculations/tax-giro"

const TOTAL_STEPS = 2 // year, amount

export const taxScene = new Scenes.WizardScene<MyContext>(
  "tax_wizard",

  // STEP 0: Year selection (or skip if pre-filled from /tax shortcut)
  async (ctx) => {
    const accountId = botState(ctx).accountId as string
    if (!accountId) {
      await ctx.reply(errorMsg("Session error: Missing account ID."))
      return ctx.scene.leave()
    }

    // Check if amount was pre-filled from "/tax 1694.50"
    const rest = botState(ctx).rest
    if (rest) {
      const parsed = Number.parseFloat(rest.replace(/[$,]/g, ""))
      if (!Number.isNaN(parsed) && parsed > 0) {
        ctx.scene.session.amount = parsed
        ctx.scene.session.year = new Date().getFullYear()
        // Jump to save step
        return ctx.wizard.selectStep(2)
      }
    }

    const currentYear = new Date().getFullYear()
    await ctx.reply(
      progressHeader(1, TOTAL_STEPS, "Tax Assessment") +
        `\nWhich year of assessment?\n\nReply with the year (e.g. *${currentYear}*) or press /cancel`,
      { parse_mode: "Markdown" }
    )
    return ctx.wizard.next()
  },

  // STEP 1: Parse year, ask for amount
  async (ctx) => {
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "")
      .trim()

    if (text === "/cancel") {
      await ctx.reply("Cancelled.")
      return ctx.scene.leave()
    }

    const minYear = 2020
    const maxYear = new Date().getUTCFullYear() + 1
    const year = Number.parseInt(text, 10)
    if (Number.isNaN(year) || year < minYear || year > maxYear) {
      await ctx.reply(
        `Please enter a valid year between ${minYear} and ${maxYear}.`,
      )
      return
    }

    ctx.scene.session.year = year

    await ctx.reply(
      progressHeader(2, TOTAL_STEPS, "Tax Assessment") +
        `\nYA ${year}: What is the *tax payable* amount?\n\nEnter the dollar amount (e.g. *1694.50*)`,
      { parse_mode: "Markdown" }
    )
    return ctx.wizard.next()
  },

  // STEP 2: Parse amount, save, respond with summary
  async (ctx) => {
    const text = (ctx.message && "text" in ctx.message ? ctx.message.text : "")
      .trim()

    if (text === "/cancel") {
      await ctx.reply("Cancelled.")
      return ctx.scene.leave()
    }

    // Parse amount (allow pre-filled from step 0)
    let amount = ctx.scene.session.amount as number | undefined
    if (!amount) {
      const parsed = Number.parseFloat(text.replace(/[$,]/g, ""))
      if (Number.isNaN(parsed) || parsed <= 0) {
        await ctx.reply("Please enter a valid positive amount (e.g. 1694.50)")
        return
      }
      amount = parsed
    }

    const year = ctx.scene.session.year as number
    const accountId = botState(ctx).accountId as string

    const supabase = createSupabaseAdmin()

    // Get first profile for this household
    const { data: household } = await supabase
      .from("households")
      .select("families(id, profiles(id, name))")
      .eq("id", accountId)
      .single()

    const profile = household?.families?.[0]?.profiles?.[0]
    if (!profile) {
      await ctx.reply(errorMsg("No profile found. Set up your account on the dashboard first."))
      return ctx.scene.leave()
    }

    try {
      // Save via tax import endpoint logic
      const { data: existingEntry } = await supabase
        .from("tax_entries")
        .select("calculated_amount")
        .eq("profile_id", profile.id)
        .eq("year", year)
        .single()

      await supabase.from("tax_entries").upsert(
        {
          profile_id: profile.id,
          year,
          calculated_amount: existingEntry?.calculated_amount ?? 0,
          actual_amount: amount,
        },
        { onConflict: "profile_id,year" }
      )

      // Auto-calculate GIRO schedule
      const giro = calculateGiroSchedule({ taxPayable: amount, year })
      const giroPii = {
        schedule: giro.schedule,
        total_payable: giro.total,
        outstanding_balance: 0,
      }
      await supabase.from("tax_giro_schedule").upsert(
        {
          profile_id: profile.id,
          year,
          ...encodeTaxGiroSchedulePiiPatch(giroPii),
          source: "calculated",
        },
        { onConflict: "profile_id,year" }
      )

      const monthly = giro.monthlyBase
      const firstMonth = giro.schedule[0]
        ? new Date(
            Number(giro.schedule[0].month.split("-")[0]),
            Number(giro.schedule[0].month.split("-")[1]) - 1,
            1
          ).toLocaleDateString("en-SG", { month: "short", year: "numeric" })
        : "Apr"
      const lastMonth = giro.schedule[giro.schedule.length - 1]
        ? new Date(
            Number(giro.schedule[giro.schedule.length - 1].month.split("-")[0]),
            Number(giro.schedule[giro.schedule.length - 1].month.split("-")[1]) - 1,
            1
          ).toLocaleDateString("en-SG", { month: "short", year: "numeric" })
        : "Mar"

      await ctx.reply(
        `✅ *YA ${year} Tax Saved*\n\n` +
          `Tax payable: *${fmtAmt(amount)}*\n` +
          `Monthly GIRO: ~*${fmtAmt(monthly)}*\n` +
          `Schedule: ${firstMonth} – ${lastMonth} (12 payments)\n\n` +
          `_View full breakdown on the dashboard._`,
        { parse_mode: "Markdown" }
      )
    } catch (err) {
      console.error("[tax-scene] Error:", err)
      await ctx.reply(errorMsg("Failed to save tax data. Please try again."))
    }

    return ctx.scene.leave()
  }
)
