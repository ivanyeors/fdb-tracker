import { Scenes } from "telegraf"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { MyContext } from "@/lib/telegram/bot"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"

export const buySellScene = new Scenes.WizardScene<MyContext>(
  "buy_sell_wizard",
  async (ctx) => {
    // Step 1: Initialize and ask for profile
    const accountId = (ctx.state as any).accountId as string
    const type = (ctx.state as any).type as "buy" | "sell"
    
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
    
    const familyIds = families.map(f => f.id)
    
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
      await ctx.reply(`Selected profile: ${profiles[0].name}\n\nEnter the stock symbol (e.g., AAPL):`)
      return ctx.wizard.next()
    }

    const buttons = profiles.map((p) => [
      { text: p.name, callback_data: `profile_${p.id}_${p.name}` }
    ])

    await ctx.reply(`Select a profile for the ${type}:`, {
      reply_markup: {
        inline_keyboard: buttons
      }
    })
    
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2: Handle profile selection -> Ask for Symbol
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("profile_")) {
        const parts = data.replace("profile_", "").split("_")
        ctx.scene.session.profileId = parts[0]
        ctx.scene.session.profileName = parts.slice(1).join("_")
        
        await ctx.answerCbQuery()
        await ctx.reply(`Selected profile: ${ctx.scene.session.profileName}\n\nEnter the stock symbol (e.g., AAPL):`)
        return ctx.wizard.next()
      }
    }
    
    if (ctx.scene.session.profileId && ctx.message && "text" in ctx.message) {
       return handleSymbolInput(ctx)
    }

    return undefined 
  },
  async (ctx) => {
    // Step 3: Handle Symbol -> Ask for Quantity
    return handleSymbolInput(ctx)
  },
  async (ctx) => {
    // Step 4: Handle Quantity -> Ask for Price
    if (!ctx.message || !("text" in ctx.message)) return undefined
    
    const quantity = parseFloat(ctx.message.text)
    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply("❌ Invalid quantity. Please enter a positive number:")
      return undefined
    }
    
    ctx.scene.session.quantity = quantity
    await ctx.reply("Enter the price per share:")
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 5: Handle Price -> Execute DB
    if (!ctx.message || !("text" in ctx.message)) return undefined
    
    const price = parseFloat(ctx.message.text)
    if (isNaN(price) || price <= 0) {
      await ctx.reply("❌ Invalid price. Please enter a positive number:")
      return undefined
    }
    
    ctx.scene.session.price = price
    
    return finishBuySell(ctx)
  }
)

async function handleSymbolInput(ctx: MyContext) {
  if (!ctx.message || !("text" in ctx.message)) return undefined
  
  const symbol = ctx.message.text.toUpperCase().trim()
  if (!symbol || symbol.includes(" ")) {
    await ctx.reply("❌ Invalid symbol. Please enter a single ticker like AAPL:")
    return undefined
  }
  
  ctx.scene.session.symbol = symbol
  await ctx.reply(`Symbol: ${symbol}\n\nEnter the quantity of shares:`)
  return ctx.wizard.next()
}

async function finishBuySell(ctx: MyContext) {
  const session = ctx.scene.session
  const profileId = session.profileId!
  const symbol = session.symbol!
  const quantity = session.quantity!
  const price = session.price!
  const type = session.type!
  
  const totalCost = quantity * price
  const supabase = createSupabaseAdmin()

  // First need family ID
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
    // Sell
    if (!existing) {
      await ctx.reply(`❌ No existing investment found for ${symbol} to sell.`)
      return ctx.scene.leave()
    }
    
    if (existing.units < quantity) {
      await ctx.reply(`❌ Insufficient units. You only have ${existing.units} shares of ${symbol}.`)
      return ctx.scene.leave()    
    }
    
    // Cost basis remains the same for sells, units decrease
    const newUnits = existing.units - quantity
    if (newUnits > 0) {
      await supabase
        .from("investments")
        .update({ units: newUnits })
        .eq("id", existing.id)
    } else {
      // If sold all, we could keep it with 0 units or delete. The current stateless flow doesn't delete, let's just update to 0.
      await supabase
        .from("investments")
        .update({ units: 0 })
        .eq("id", existing.id)
    }
    investmentId = existing.id
  }

  // Record transaction
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
      journal_text: null, // Can't easily support journal in this flow without more steps, keeping simple
    })

  if (txError) {
     await ctx.reply(`❌ Transaction error: ${txError.message}`)
     return ctx.scene.leave()
  }

  // Update cash balance
  const accountFilter = { family_id: familyId, profile_id: profileId }
  const { data: accountRow } = await supabase
    .from("investment_accounts")
    .select("id, cash_balance")
    .match(accountFilter)
    .maybeSingle()
    
  // If buy, balance decreases. If sell, balance increases.
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
    `✅ ${session.profileName} ${type === "buy" ? "bought" : "sold"} ${quantity} ${symbol} @ $${price}. Total: $${totalCost.toFixed(2)}.`
  )
  return ctx.scene.leave()
}
