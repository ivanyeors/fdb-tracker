import { Scenes } from "telegraf"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"
import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  errorMsg,
  fmtAmt,
  advanceOrReturn,
} from "@/lib/telegram/scene-helpers"

// Step indices (STEP_PROFILE=0, STEP_PROFILE_CB=1 are implicit first steps)
const STEP_SYMBOL = 2
const STEP_QUANTITY = 3
const STEP_PRICE = 4
const STEP_NOTE = 5
const STEP_CONFIRM = 6
const TOTAL_STEPS = 6 // profile, symbol, qty, price, note, confirm

function typeLabel(type: "buy" | "sell") {
  return type === "buy" ? "buy" : "sell"
}

async function sendConfirmation(ctx: MyContext) {
  const s = ctx.scene.session
  const total = (s.quantity ?? 0) * (s.price ?? 0)
  const fields = [
    { label: "Profile", value: s.profileName ?? "—" },
    { label: "Type", value: s.type === "buy" ? "Buy" : "Sell" },
    { label: "Symbol", value: s.symbol ?? "—" },
    {
      label: "Quantity",
      value: s.quantity != null ? `${s.quantity} shares` : "—",
    },
    { label: "Price", value: s.price != null ? fmtAmt(s.price) : "—" },
    { label: "Total", value: fmtAmt(total) },
  ]
  if (s.journalNote) {
    fields.push({ label: "Note", value: s.journalNote })
  }

  const msg = buildConfirmationMessage(
    `Confirm ${s.type === "buy" ? "Buy" : "Sell"}`,
    fields,
  )
  const editFields = [
    { label: "Symbol", callbackData: "ed_sym" },
    { label: "Quantity", callbackData: "ed_qty" },
    { label: "Price", callbackData: "ed_prc" },
    { label: "Note", callbackData: "ed_note" },
  ]
  const keyboard = buildConfirmationKeyboard(editFields)
  await ctx.reply(msg, { reply_markup: keyboard })
}

export const buySellScene = new Scenes.WizardScene<MyContext>(
  "buy_sell_wizard",
  // STEP 0: Profile selection
  async (ctx) => {
    const accountId = botState(ctx).accountId as string
    const type = botState(ctx).type as "buy" | "sell"

    if (!accountId || !type) {
      await ctx.reply("❌ Session error: Missing account ID or type.")
      return ctx.scene.leave()
    }

    ctx.scene.session.type = type

    const supabase = createSupabaseAdmin()
    const { data: families, error: familiesError } = await supabase
      .from("families")
      .select("id")
      .eq("household_id", accountId)

    if (familiesError || !families || families.length === 0) {
      await ctx.reply("❌ No family found for this account.")
      return ctx.scene.leave()
    }

    const familyIds = families.map((f) => f.id)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name")
      .in("family_id", familyIds)

    if (profilesError || !profiles || profiles.length === 0) {
      await ctx.reply("❌ No profiles found.")
      return ctx.scene.leave()
    }

    if (profiles.length === 1) {
      ctx.scene.session.profileId = profiles[0].id
      ctx.scene.session.profileName = profiles[0].name
      const header = progressHeader(
        2,
        TOTAL_STEPS,
        `Recording ${typeLabel(type)} for ${profiles[0].name}`,
      )
      await ctx.reply(
        `${header}\n\nEnter the stock symbol (e.g. AAPL):`,
      )
      ctx.wizard.selectStep(STEP_SYMBOL)
      return
    }

    const buttons = profiles.map((p) => [
      { text: p.name, callback_data: `profile_${p.id}_${p.name}` },
    ])

    const header = progressHeader(
      1,
      TOTAL_STEPS,
      `Recording ${typeLabel(type)}`,
    )
    await ctx.reply(`${header}\n\nSelect a profile:`, {
      reply_markup: { inline_keyboard: buttons },
    })
    return ctx.wizard.next()
  },

  // STEP 1: Profile callback
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("profile_")) {
        const parts = data.replace("profile_", "").split("_")
        ctx.scene.session.profileId = parts[0]
        ctx.scene.session.profileName = parts.slice(1).join("_")
        await ctx.answerCbQuery()

        const header = progressHeader(
          2,
          TOTAL_STEPS,
          `Recording ${typeLabel(ctx.scene.session.type!)} for ${ctx.scene.session.profileName}`,
        )
        await ctx.reply(
          `${header}\n\nEnter the stock symbol (e.g. AAPL):`,
        )
        return ctx.wizard.next()
      }
    }
    return undefined
  },

  // STEP 2: Symbol input
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const symbol = ctx.message.text.toUpperCase().trim()
    if (!symbol || symbol.includes(" ")) {
      await ctx.reply(
        errorMsg(
          "Invalid symbol. Enter a single ticker.",
          "AAPL",
        ),
      )
      return undefined
    }

    ctx.scene.session.symbol = symbol

    const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
    if (returned) return

    const header = progressHeader(
      3,
      TOTAL_STEPS,
      `${typeLabel(ctx.scene.session.type!)} ${symbol} for ${ctx.scene.session.profileName}`,
    )
    await ctx.reply(`${header}\n\nEnter the quantity of shares:`)
    return ctx.wizard.next()
  },

  // STEP 3: Quantity input
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const quantity = parseFloat(ctx.message.text)
    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply(
        errorMsg("Invalid quantity. Enter a positive number.", "10"),
      )
      return undefined
    }

    ctx.scene.session.quantity = quantity

    const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
    if (returned) return

    const header = progressHeader(
      4,
      TOTAL_STEPS,
      `${typeLabel(ctx.scene.session.type!)} ${ctx.scene.session.quantity} ${ctx.scene.session.symbol} for ${ctx.scene.session.profileName}`,
    )
    await ctx.reply(`${header}\n\nEnter the price per share:`)
    return ctx.wizard.next()
  },

  // STEP 4: Price input
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const price = parseFloat(ctx.message.text)
    if (isNaN(price) || price <= 0) {
      await ctx.reply(
        errorMsg("Invalid price. Enter a positive number.", "150.50"),
      )
      return undefined
    }

    ctx.scene.session.price = price

    const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
    if (returned) return

    const header = progressHeader(
      5,
      TOTAL_STEPS,
      `${typeLabel(ctx.scene.session.type!)} ${ctx.scene.session.quantity} ${ctx.scene.session.symbol} @ ${fmtAmt(price)}`,
    )
    await ctx.reply(
      `${header}\n\n💭 Want to add a short note? (Optional)\nReply with text, or send /skip.`,
    )
    return ctx.wizard.next()
  },

  // STEP 5: Optional note
  async (ctx) => {
    if (!ctx.message || !("text" in ctx.message)) return undefined
    const t = ctx.message.text.trim()

    if (t === "/skip" || t.toLowerCase() === "skip") {
      ctx.scene.session.journalNote = undefined
    } else {
      ctx.scene.session.journalNote = t.slice(0, 2000)
    }

    const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
    if (returned) return

    ctx.wizard.selectStep(STEP_CONFIRM)
    await sendConfirmation(ctx)
    return
  },

  // STEP 6: Confirmation
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()

      if (data === "cf") {
        return finishBuySell(ctx)
      }

      if (data === "cn") {
        await ctx.reply("Cancelled.")
        return ctx.scene.leave()
      }

      if (data === "ed_sym") {
        ctx.scene.session.editingField = "symbol"
        ctx.wizard.selectStep(STEP_SYMBOL)
        await ctx.reply("Enter the new stock symbol:")
        return
      }

      if (data === "ed_qty") {
        ctx.scene.session.editingField = "quantity"
        ctx.wizard.selectStep(STEP_QUANTITY)
        await ctx.reply("Enter the new quantity:")
        return
      }

      if (data === "ed_prc") {
        ctx.scene.session.editingField = "price"
        ctx.wizard.selectStep(STEP_PRICE)
        await ctx.reply("Enter the new price per share:")
        return
      }

      if (data === "ed_note") {
        ctx.scene.session.editingField = "note"
        ctx.wizard.selectStep(STEP_NOTE)
        await ctx.reply("Enter a new note, or send /skip to remove it.")
        return
      }
    }

    return undefined
  },
)

async function finishBuySell(ctx: MyContext) {
  const session = ctx.scene.session
  const profileId = session.profileId!
  const symbol = session.symbol!
  const quantity = session.quantity!
  const price = session.price!
  const type = session.type!

  const totalCost = quantity * price
  const journalText = session.journalNote?.trim() || null
  const supabase = createSupabaseAdmin()

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", profileId)
    .single()

  if (!profile) {
    await ctx.reply("❌ Profile lookup failed.")
    return ctx.scene.leave()
  }

  const familyId = profile.family_id

  const { data: existing } = await supabase
    .from("investments")
    .select("id, units, cost_basis")
    .eq("family_id", familyId)
    .eq("profile_id", profileId)
    .eq("symbol", symbol)
    .maybeSingle()

  let investmentId: string

  if (type === "buy") {
    if (existing) {
      const newCostBasis = calculateWeightedAverageCost(
        existing.units,
        existing.cost_basis,
        quantity,
        price,
      )
      const newUnits = existing.units + quantity

      const { error: updateError } = await supabase
        .from("investments")
        .update({ units: newUnits, cost_basis: newCostBasis })
        .eq("id", existing.id)

      if (updateError) {
        await ctx.reply(`❌ Update error: ${updateError.message}`)
        return ctx.scene.leave()
      }
      investmentId = existing.id
    } else {
      const { data: newHolding, error: insertError } = await supabase
        .from("investments")
        .insert({
          family_id: familyId,
          profile_id: profileId,
          type: "stock",
          symbol,
          units: quantity,
          cost_basis: price,
        })
        .select("id")
        .single()

      if (insertError || !newHolding) {
        await ctx.reply(`❌ Insert error: ${insertError?.message}`)
        return ctx.scene.leave()
      }
      investmentId = newHolding.id
    }
  } else {
    if (!existing) {
      await ctx.reply(`❌ No existing investment found for ${symbol} to sell.`)
      return ctx.scene.leave()
    }

    if (existing.units < quantity) {
      await ctx.reply(
        `❌ Insufficient units. You only have ${existing.units} shares of ${symbol}.`,
      )
      return ctx.scene.leave()
    }

    const newUnits = existing.units - quantity
    await supabase
      .from("investments")
      .update({ units: newUnits })
      .eq("id", existing.id)

    investmentId = existing.id
  }

  const { error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      family_id: familyId,
      investment_id: investmentId,
      profile_id: profileId,
      type,
      symbol,
      quantity,
      price,
      ...(journalText ? { journal_text: journalText } : {}),
    })

  if (txError) {
    await ctx.reply(`❌ Transaction error: ${txError.message}`)
    return ctx.scene.leave()
  }

  const accountFilter = { family_id: familyId, profile_id: profileId }
  const { data: accountRow } = await supabase
    .from("investment_accounts")
    .select("id, cash_balance")
    .match(accountFilter)
    .maybeSingle()

  const cashDelta = type === "buy" ? -totalCost : totalCost

  if (accountRow) {
    await supabase
      .from("investment_accounts")
      .update({
        cash_balance: accountRow.cash_balance + cashDelta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountRow.id)
  } else {
    await supabase.from("investment_accounts").insert({
      family_id: familyId,
      profile_id: profileId,
      cash_balance: cashDelta,
      updated_at: new Date().toISOString(),
    })
  }

  await ctx.reply(
    `✅ ${session.profileName} ${type === "buy" ? "bought" : "sold"} ${quantity} ${symbol} @ ${fmtAmt(price)}. Total: ${fmtAmt(totalCost)}.`,
  )
  return ctx.scene.leave()
}
