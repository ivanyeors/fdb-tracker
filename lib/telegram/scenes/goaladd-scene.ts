import { Scenes } from "telegraf"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { MyContext } from "@/lib/telegram/bot"

export const goalAddScene = new Scenes.WizardScene<MyContext>(
  "goaladd_wizard",
  async (ctx) => {
    // Step 1: Request account and check existing Savings Goals
    const accountId = (ctx.state as any).accountId as string
    
    if (!accountId) {
      await ctx.reply("❌ Session error: No account ID found.")
      return ctx.scene.leave()
    }
    
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
    
    // Fetch goals linked to these families
    const { data: goals, error: goalsError } = await supabase
      .from("savings_goals")
      .select("id, name, target_amount, current_amount")
      .in("family_id", familyIds)
      
    if (goalsError || !goals || goals.length === 0) {
      await ctx.reply("❌ No savings goals found. Create one in the web dashboard first.")
      return ctx.scene.leave()
    }
    
    if (goals.length === 1) {
      // Auto-select if only one goal
      ctx.scene.session.goalId = goals[0].id
      await ctx.reply(`Selected Goal: ${goals[0].name} ($${goals[0].current_amount} / $${goals[0].target_amount})\n\nEnter the amount to add:`)
      return ctx.wizard.next()
    }

    // Multiple goals, show inline keyboard
    const buttons = goals.map((g) => [
      { text: `${g.name} ($${g.current_amount}/${g.target_amount})`, callback_data: `goal_${g.id}` }
    ])

    await ctx.reply("Select a Savings Goal to add funds to:", {
      reply_markup: {
        inline_keyboard: buttons
      }
    })
    
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2: Handle Goal selection -> Ask for Add Amount
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("goal_")) {
        const goalId = data.replace("goal_", "")
        ctx.scene.session.goalId = goalId
        
        await ctx.answerCbQuery()
        await ctx.reply("Enter the amount to add:")
        return ctx.wizard.next()
      }
    }
    
    // Handle text input if it was auto-selected
    if (ctx.scene.session.goalId && ctx.message && "text" in ctx.message) {
      return handleAmountInput(ctx)
    }

    return undefined 
  },
  async (ctx) => {
    // Step 3: Handle Amount input -> Add to Contribution and Update Goal
    return handleAmountInput(ctx)
  }
)

async function handleAmountInput(ctx: MyContext) {
  if (!ctx.message || !("text" in ctx.message)) return undefined
  
  const amount = parseFloat(ctx.message.text)
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply("❌ Invalid amount. Please enter a valid positive number.")
    return undefined // Stay on this step
  }
  
  const goalId = ctx.scene.session.goalId!
  const supabase = createSupabaseAdmin()
  
  const { data: goal, error: goalError } = await supabase
    .from("savings_goals")
    .select("id, name, current_amount, target_amount")
    .eq("id", goalId)
    .single()
    
  if (goalError || !goal) {
    await ctx.reply("❌ Goal lookup failed.")
    return ctx.scene.leave()
  }

  const { error: contribError } = await supabase
    .from("goal_contributions")
    .insert({
      goal_id: goal.id,
      amount,
      source: "telegram",
    })

  if (contribError) {
    await ctx.reply(`❌ Contribution error: ${contribError.message}`)
    return ctx.scene.leave()
  }

  const newCurrent = goal.current_amount + amount

  const { error: updateError } = await supabase
    .from("savings_goals")
    .update({ current_amount: newCurrent })
    .eq("id", goal.id)

  if (updateError) {
    await ctx.reply(`❌ Update error: ${updateError.message}`)
    return ctx.scene.leave()
  }

  const pct = goal.target_amount > 0
    ? Math.round((newCurrent / goal.target_amount) * 100)
    : 0

  await ctx.reply(`✅ Added $${amount} to ${goal.name}. Progress: ${pct}% ($${newCurrent}/$${goal.target_amount}).`)
  return ctx.scene.leave()
}
