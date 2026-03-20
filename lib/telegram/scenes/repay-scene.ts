import { Scenes } from "telegraf"
import { format } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"

export const repayScene = new Scenes.WizardScene<MyContext>(
  "repay_wizard",
  async (ctx) => {
    // Step 1: Initialize and ask for loan
    const accountId = botState(ctx).accountId as string
    const isEarlyRepayment = botState(ctx).isEarlyRepayment as boolean
    
    if (!accountId) {
      await ctx.reply("❌ Session error: Missing account ID.")
      return ctx.scene.leave()
    }
    
    ctx.scene.session.isEarlyRepayment = isEarlyRepayment

    const supabase = createSupabaseAdmin()
    
    // Fetch profiles first to get loans linked to them
    const { data: households } = await supabase
      .from("households")
      .select(`
        families (
          id,
          profiles (id)
        )
      `)
      .eq("id", accountId)
      .single()

    const profileIds = households?.families?.flatMap(f => f.profiles.map(p => p.id)) || []
      
    if (profileIds.length === 0) {
      await ctx.reply("❌ No profiles found for this account.")
      return ctx.scene.leave()
    }
    
    // Fetch loans
    const { data: loans, error: loansError } = await supabase
      .from("loans")
      .select("id, name, principal")
      .in("profile_id", profileIds)
      
    if (loansError || !loans || loans.length === 0) {
      await ctx.reply("❌ No loans found. Create one in the web dashboard first.")
      return ctx.scene.leave()
    }

    if (loans.length === 1) {
      ctx.scene.session.loanId = loans[0].id
      await ctx.reply(`Selected Loan: ${loans[0].name}\n\nEnter the repayment amount:`)
      return ctx.wizard.next()
    }

    const buttons = loans.map((l) => [
      { text: l.name, callback_data: `loan_${l.id}` }
    ])

    await ctx.reply(`Select a loan to log a ${isEarlyRepayment ? "early " : ""}repayment:`, {
      reply_markup: {
        inline_keyboard: buttons
      }
    })
    
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2: Handle Loan selection -> Ask for Amount
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("loan_")) {
        ctx.scene.session.loanId = data.replace("loan_", "")
        
        await ctx.answerCbQuery()
        await ctx.reply("Enter the repayment amount:")
        return ctx.wizard.next()
      }
    }
    
    if (ctx.scene.session.loanId && ctx.message && "text" in ctx.message) {
       return handleAmountInput(ctx)
    }

    return undefined 
  },
  async (ctx) => {
    // Step 3: Handle Amount -> Execute DB
    return handleAmountInput(ctx)
  }
)

async function handleAmountInput(ctx: MyContext) {
  if (!ctx.message || !("text" in ctx.message)) return undefined
  
  const amount = parseFloat(ctx.message.text)
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply("❌ Invalid amount. Please enter a valid positive number.")
    return undefined
  }
  
  const session = ctx.scene.session
  const loanId = session.loanId!
  const isEarlyRepayment = session.isEarlyRepayment!
  
  const supabase = createSupabaseAdmin()

  const { data: loan } = await supabase
    .from("loans")
    .select("id, name")
    .eq("id", loanId)
    .single()
    
  if (!loan) {
    await ctx.reply("❌ Loan lookup failed.")
    return ctx.scene.leave()
  }

  const today = format(new Date(), "yyyy-MM-dd")

  if (isEarlyRepayment) {
    const { error } = await supabase.from("loan_early_repayments").insert({
      loan_id: loan.id,
      amount,
      date: today,
    })

    if (error) {
       await ctx.reply(`❌ Database error: ${error.message}`)
       return ctx.scene.leave()
    }
    
    await ctx.reply(`✅ Early repayment of $${amount} logged for ${loan.name}. Principal reduced.`)

  } else {
    const { error } = await supabase.from("loan_repayments").insert({
      loan_id: loan.id,
      amount,
      date: today,
    })

    if (error) {
       await ctx.reply(`❌ Database error: ${error.message}`)
       return ctx.scene.leave()
    }
    
    await ctx.reply(`✅ Repayment of $${amount} logged for ${loan.name}.`)
  }

  return ctx.scene.leave()
}
