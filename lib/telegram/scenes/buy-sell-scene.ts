import { Scenes } from "telegraf"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import { sanitizeText } from "@/lib/telegram/sanitize"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"
import { searchStocks } from "@/lib/external/fmp"
import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  errorMsg,
  fmtAmt,
  advanceOrReturn,
  handleStrayCallback,
} from "@/lib/telegram/scene-helpers"

// Step indices (STEP_PROFILE=0, STEP_PROFILE_CB=1 are implicit first steps)
const STEP_ACCOUNT = 2
const STEP_ACCOUNT_CB = 3
const STEP_SYMBOL = 4
const STEP_QUANTITY = 5
const STEP_PRICE = 6
const STEP_COMMISSION = 7
const STEP_NOTE = 8
const STEP_CONFIRM = 9
const TOTAL_STEPS = 8 // profile, account, symbol, qty, price, commission, note, confirm

function typeLabel(type: "buy" | "sell") {
  return type === "buy" ? "buy" : "sell"
}

/**
 * Prompt the account selection step. If only one account, auto-select.
 * Returns true if auto-selected (caller should advance to symbol).
 */
async function promptAccountStep(ctx: MyContext): Promise<boolean> {
  const s = ctx.scene.session
  const supabase = createSupabaseAdmin()

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", s.profileId!)
    .single()

  if (!profile) return true

  const { data: accounts } = await supabase
    .from("investment_accounts")
    .select("id, account_name, cash_balance")
    .eq("family_id", profile.family_id)
    .eq("profile_id", s.profileId!)
    .order("created_at", { ascending: true })

  if (!accounts || accounts.length <= 1) {
    // Auto-select single/default account
    if (accounts && accounts.length === 1) {
      s.accountId = accounts[0].id
      s.accountName = accounts[0].account_name
    }
    return true
  }

  const buttons = accounts.map((a) => [
    {
      text: `${a.account_name} ($${Number(a.cash_balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
      callback_data: `acct_${a.id}_${a.account_name.slice(0, 30)}`,
    },
  ])

  const header = progressHeader(
    2,
    TOTAL_STEPS,
    `Recording ${typeLabel(s.type!)} for ${s.profileName}`,
  )
  await ctx.reply(`${header}\n\nSelect an investment account:`, {
    reply_markup: { inline_keyboard: buttons },
  })
  return false
}

/**
 * Prompt the symbol step. For sell, shows existing holdings as inline buttons.
 * For buy, shows the standard text prompt.
 */
async function promptSymbolStep(ctx: MyContext) {
  const s = ctx.scene.session
  const header = progressHeader(
    3,
    TOTAL_STEPS,
    `Recording ${typeLabel(s.type!)} for ${s.profileName}`,
  )

  if (s.type === "sell") {
    const supabase = createSupabaseAdmin()
    const { data: profile } = await supabase
      .from("profiles")
      .select("family_id")
      .eq("id", s.profileId!)
      .single()

    if (profile) {
      const { data: holdings } = await supabase
        .from("investments")
        .select("symbol, units")
        .eq("family_id", profile.family_id)
        .eq("profile_id", s.profileId!)
        .gt("units", 0)
        .order("symbol")

      if (holdings && holdings.length > 0) {
        const buttons = holdings.slice(0, 20).map((h) => [
          {
            text: `${h.symbol} (${h.units} shares)`,
            callback_data: `hsym_${h.symbol}`,
          },
        ])
        buttons.push([
          { text: "Type manually", callback_data: "hsym_manual" },
        ])
        await ctx.reply(`${header}\n\nSelect a stock to sell:`, {
          reply_markup: { inline_keyboard: buttons },
        })
        return
      }
    }
  }

  await ctx.reply(`${header}\n\nEnter the stock symbol (e.g. AAPL):`)
}

/**
 * Fetch and display previous journal notes for a symbol before selling.
 */
async function showStockNotes(ctx: MyContext): Promise<void> {
  const s = ctx.scene.session
  if (s.type !== "sell" || !s.profileId || !s.symbol) return

  const supabase = createSupabaseAdmin()
  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", s.profileId)
    .single()

  if (!profile) return

  const { data: notes } = await supabase
    .from("investment_transactions")
    .select("type, journal_text, created_at")
    .eq("family_id", profile.family_id)
    .eq("symbol", s.symbol)
    .not("journal_text", "is", null)
    .neq("journal_text", "")
    .order("created_at", { ascending: true })
    .limit(10)

  if (!notes || notes.length === 0) return

  const maxDisplay = 5
  const displayed = notes.slice(0, maxDisplay)
  const lines = displayed.map((n) => {
    const date = new Date(n.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    const typeTag = (n.type as string).charAt(0).toUpperCase() + (n.type as string).slice(1)
    return `📅 ${date} (${typeTag})\n${n.journal_text}`
  })

  let msg = `📒 Your notes for ${s.symbol}:\n\n${lines.join("\n\n")}`
  if (notes.length > maxDisplay) {
    msg += `\n\n… and ${notes.length - maxDisplay} more note${notes.length - maxDisplay === 1 ? "" : "s"}. View all on dashboard.`
  }

  await ctx.reply(msg)
}

/**
 * Shared transition from symbol → quantity step (or back to confirmation if editing).
 */
async function proceedFromSymbol(ctx: MyContext): Promise<boolean> {
  const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
  if (returned) return true

  await showStockNotes(ctx)

  const s = ctx.scene.session
  const header = progressHeader(
    4,
    TOTAL_STEPS,
    `${typeLabel(s.type!)} ${s.symbol} for ${s.profileName}`,
  )
  await ctx.reply(`${header}\n\nEnter the quantity of shares:`)
  ctx.wizard.next()
  return false
}

async function sendConfirmation(ctx: MyContext) {
  const s = ctx.scene.session
  const fee = s.commission ?? 0
  const gross = (s.quantity ?? 0) * (s.price ?? 0)
  const total = s.type === "buy" ? gross + fee : gross - fee
  const symbolDisplay = s.symbolName
    ? `${s.symbol} (${s.symbolName})`
    : (s.symbol ?? "—")
  const fields = [
    { label: "Profile", value: s.profileName ?? "—" },
    ...(s.accountName ? [{ label: "Account", value: s.accountName }] : []),
    { label: "Type", value: s.type === "buy" ? "Buy" : "Sell" },
    { label: "Symbol", value: symbolDisplay },
    {
      label: "Quantity",
      value: s.quantity != null ? `${s.quantity} shares` : "—",
    },
    { label: "Price", value: s.price != null ? fmtAmt(s.price) : "—" },
  ]
  if (fee > 0) {
    fields.push({ label: "Commission", value: fmtAmt(fee) })
  }
  fields.push({ label: "Total", value: fmtAmt(total) })
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
    { label: "Commission", callbackData: "ed_comm" },
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
    const preProfileId = botState(ctx).profileId
    const preFamilyId = botState(ctx).familyId

    if (!accountId || !type) {
      await ctx.reply("❌ Session error: Missing account ID or type.")
      return ctx.scene.leave()
    }

    ctx.scene.session.type = type

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
      await ctx.reply("❌ No profiles found.")
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

    if (profiles.length === 1) {
      ctx.scene.session.profileId = profiles[0].id
      ctx.scene.session.profileName = profiles[0].name
      // Try account selection
      const autoSelected = await promptAccountStep(ctx)
      if (autoSelected) {
        ctx.wizard.selectStep(STEP_SYMBOL)
        await promptSymbolStep(ctx)
      } else {
        ctx.wizard.selectStep(STEP_ACCOUNT_CB)
      }
      return
    }

    const buttons = profiles.map((p) => [
      { text: p.name, callback_data: `profile_${p.id}_${p.name}` },
    ])

    const header = progressHeader(
      1,
      TOTAL_STEPS,
      `Recording ${typeLabel(type)}`
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

        // Try account selection
        const autoSelected = await promptAccountStep(ctx)
        if (autoSelected) {
          ctx.wizard.selectStep(STEP_SYMBOL)
          await promptSymbolStep(ctx)
        } else {
          ctx.wizard.selectStep(STEP_ACCOUNT_CB)
        }
        return
      }
    }
    return undefined
  },

  // STEP 2: Account selection prompt (rendered by promptAccountStep)
  async (_ctx) => {
    // This step is a placeholder — account prompt was sent by the previous step.
    // The actual callback is handled in STEP 3 (STEP_ACCOUNT_CB).
    return undefined
  },

  // STEP 3: Account callback
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("acct_")) {
        const parts = data.replace("acct_", "").split("_")
        ctx.scene.session.accountId = parts[0]
        ctx.scene.session.accountName = parts.slice(1).join("_")
        await ctx.answerCbQuery()

        ctx.wizard.selectStep(STEP_SYMBOL)
        await promptSymbolStep(ctx)
        return
      }
    }
    return undefined
  },

  // STEP 2: Symbol input (text + inline keyboard callbacks)
  async (ctx) => {
    // --- Path A: Sell holdings picker callback (hsym_) ---
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()

      if (data === "hsym_manual") {
        await ctx.reply("Enter the stock symbol:")
        return
      }

      if (data.startsWith("hsym_")) {
        const symbol = data.replace("hsym_", "")
        ctx.scene.session.symbol = symbol
        ctx.scene.session.symbolName = undefined
        await proceedFromSymbol(ctx)
        return
      }

      // --- Path B: Buy search picker callback (ssym_) ---
      if (data === "ssym_raw") {
        // symbol already set from text input
        await proceedFromSymbol(ctx)
        return
      }

      if (data.startsWith("ssym_")) {
        const parts = data.replace("ssym_", "").split("|")
        ctx.scene.session.symbol = parts[0]
        ctx.scene.session.symbolName = parts[1] || undefined
        await proceedFromSymbol(ctx)
        return
      }

      return
    }

    // --- Path C: Text input ---
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const symbol = ctx.message.text.toUpperCase().trim()
    if (!symbol || symbol.includes(" ")) {
      await ctx.reply(
        errorMsg("Invalid symbol. Enter a single ticker.", "AAPL")
      )
      return undefined
    }

    // For sell, accept directly (no API lookup needed)
    if (ctx.scene.session.type === "sell") {
      ctx.scene.session.symbol = symbol
      ctx.scene.session.symbolName = undefined
      await proceedFromSymbol(ctx)
      return
    }

    // For buy, try FMP stock search
    const results = await searchStocks(symbol)

    if (
      results.length > 0 &&
      results[0].ticker.toUpperCase() === symbol
    ) {
      // Exact match — auto-accept
      ctx.scene.session.symbol = results[0].ticker
      ctx.scene.session.symbolName = results[0].name || undefined
      await proceedFromSymbol(ctx)
      return
    }

    if (results.length > 1) {
      // Multiple matches — show picker
      ctx.scene.session.symbol = symbol
      const buttons = results.slice(0, 8).map((r) => {
        // Telegram callback_data max 64 bytes — truncate name to fit
        const name = (r.name ?? "").slice(0, 50)
        return [
          {
            text: `${r.ticker} — ${r.name ?? "Unknown"}${r.exchange ? ` (${r.exchange})` : ""}`,
            callback_data: `ssym_${r.ticker}|${name}`,
          },
        ]
      })
      buttons.push([
        {
          text: `Use "${symbol}" as entered`,
          callback_data: "ssym_raw",
        },
      ])
      await ctx.reply("Multiple matches found. Select one:", {
        reply_markup: { inline_keyboard: buttons },
      })
      return
    }

    // No results or single non-exact match — accept raw symbol
    ctx.scene.session.symbol = symbol
    if (results.length === 1) {
      ctx.scene.session.symbolName = results[0].name || undefined
    }
    await proceedFromSymbol(ctx)
    return
  },

  // STEP 3: Quantity input
  async (ctx) => {
    if (await handleStrayCallback(ctx, "the new quantity")) return
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const quantity = parseFloat(ctx.message.text)
    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply(
        errorMsg("Invalid quantity. Enter a positive number.", "10")
      )
      return undefined
    }

    ctx.scene.session.quantity = quantity

    const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
    if (returned) return

    const header = progressHeader(
      5,
      TOTAL_STEPS,
      `${typeLabel(ctx.scene.session.type!)} ${ctx.scene.session.quantity} ${ctx.scene.session.symbol} for ${ctx.scene.session.profileName}`,
    )
    await ctx.reply(`${header}\n\nEnter the price per share:`)
    return ctx.wizard.next()
  },

  // STEP 4: Price input
  async (ctx) => {
    if (await handleStrayCallback(ctx, "the new price per share")) return
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
      6,
      TOTAL_STEPS,
      `${typeLabel(ctx.scene.session.type!)} ${ctx.scene.session.quantity} ${ctx.scene.session.symbol} @ ${fmtAmt(price)}`,
    )
    await ctx.reply(
      `${header}\n\n💰 Enter broker commission (or /skip for $0):`,
    )
    return ctx.wizard.next()
  },

  // STEP 5: Commission input
  async (ctx) => {
    if (await handleStrayCallback(ctx, "the new commission (or /skip for $0)"))
      return
    if (!ctx.message || !("text" in ctx.message)) return undefined
    const t = ctx.message.text.trim()

    if (t === "/skip" || t.toLowerCase() === "skip" || t === "0") {
      ctx.scene.session.commission = 0
    } else {
      const fee = parseFloat(t)
      if (isNaN(fee) || fee < 0) {
        await ctx.reply(
          errorMsg("Invalid commission. Enter a number ≥ 0.", "1.50"),
        )
        return undefined
      }
      ctx.scene.session.commission = fee
    }

    const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
    if (returned) return

    const s = ctx.scene.session
    const header = progressHeader(
      7,
      TOTAL_STEPS,
      `${typeLabel(s.type!)} ${s.quantity} ${s.symbol} @ ${fmtAmt(s.price!)}`,
    )
    await ctx.reply(
      `${header}\n\n💭 Want to add a short note? (Optional)\nReply with text, or send /skip.`,
    )
    return ctx.wizard.next()
  },

  // STEP 6: Optional note
  async (ctx) => {
    if (await handleStrayCallback(ctx, "a note (or /skip)")) return
    if (!ctx.message || !("text" in ctx.message)) return undefined
    const t = ctx.message.text.trim()

    if (t === "/skip" || t.toLowerCase() === "skip") {
      ctx.scene.session.journalNote = undefined
    } else {
      ctx.scene.session.journalNote = sanitizeText(t)
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
        await promptSymbolStep(ctx)
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

      if (data === "ed_comm") {
        ctx.scene.session.editingField = "commission"
        ctx.wizard.selectStep(STEP_COMMISSION)
        await ctx.reply("Enter the new commission (or /skip for $0):")
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
  }
)

async function finishBuySell(ctx: MyContext) {
  const session = ctx.scene.session
  const profileId = session.profileId!
  const symbol = session.symbol!
  const quantity = session.quantity!
  const price = session.price!
  const type = session.type!
  const commission = session.commission ?? 0

  const gross = quantity * price
  const buyCashOutlay = gross + commission
  const sellCashProceeds = gross - commission
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

  const { data: existingRows } = await supabase
    .from("investments")
    .select("id, units, cost_basis")
    .eq("family_id", familyId)
    .eq("profile_id", profileId)
    .eq("symbol", symbol)
    .order("created_at", { ascending: true })
    .limit(1)
  const existing = existingRows?.[0] ?? null

  let investmentId: string

  if (type === "buy") {
    if (existing) {
      const newCostBasis = calculateWeightedAverageCost(
        existing.units,
        existing.cost_basis,
        quantity,
        price,
        commission,
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
      const effectiveCostBasis =
        commission > 0 ? (gross + commission) / quantity : price
      const { data: newHolding, error: insertError } = await supabase
        .from("investments")
        .insert({
          family_id: familyId,
          profile_id: profileId,
          type: "stock",
          symbol,
          units: quantity,
          cost_basis: effectiveCostBasis,
          account_id: session.accountId ?? null,
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

  const selectedAccountId = session.accountId ?? null

  const { error: txError } = await supabase
    .from("investment_transactions")
    .insert({
      family_id: familyId,
      investment_id: investmentId,
      profile_id: profileId,
      account_id: selectedAccountId,
      type,
      symbol,
      quantity,
      price,
      commission,
      ...(journalText ? { journal_text: journalText } : {}),
    })

  if (txError) {
    await ctx.reply(`❌ Transaction error: ${txError.message}`)
    return ctx.scene.leave()
  }

  // Update cash balance on the selected account (or find/create default)
  const cashDelta = type === "buy" ? -buyCashOutlay : sellCashProceeds

  if (selectedAccountId) {
    const { data: accountRow } = await supabase
      .from("investment_accounts")
      .select("id, cash_balance")
      .eq("id", selectedAccountId)
      .single()

    if (accountRow) {
      await supabase
        .from("investment_accounts")
        .update({
          cash_balance: accountRow.cash_balance + cashDelta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountRow.id)
    }
  } else {
    const { data: accountRow } = await supabase
      .from("investment_accounts")
      .select("id, cash_balance")
      .eq("family_id", familyId)
      .eq("profile_id", profileId)
      .maybeSingle()

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
  }

  const totalDisplay = type === "buy" ? buyCashOutlay : sellCashProceeds
  const feeNote = commission > 0 ? ` (incl. ${fmtAmt(commission)} fee)` : ""
  await ctx.reply(
    `✅ ${session.profileName} ${type === "buy" ? "bought" : "sold"} ${quantity} ${symbol} @ ${fmtAmt(price)}. Total: ${fmtAmt(totalDisplay)}${feeNote}.`,
  )
  return ctx.scene.leave()
}
