import { Scenes } from "telegraf"
import { format } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  errorMsg,
  fmtAmt,
  advanceOrReturn,
} from "@/lib/telegram/scene-helpers"

// Step indices (STEP_LOAN=0, STEP_LOAN_CB=1 are implicit first steps)
const STEP_AMOUNT = 2
const STEP_CONFIRM = 3
const TOTAL_STEPS = 2 // loan, amount

async function sendConfirmation(ctx: MyContext) {
  const s = ctx.scene.session
  const repayType = s.isEarlyRepayment ? "Early Repayment" : "Repayment"
  const fields = [
    { label: "Loan", value: s.loanName ?? "—" },
    { label: "Type", value: repayType },
    { label: "Amount", value: s.amount == null ? "—" : fmtAmt(s.amount) },
    { label: "Date", value: format(new Date(), "d MMM yyyy") },
  ]

  const msg = buildConfirmationMessage("Confirm Repayment", fields)
  const editFields = [{ label: "Amount", callbackData: "ed_amt" }]
  const keyboard = buildConfirmationKeyboard(editFields)
  await ctx.reply(msg, { reply_markup: keyboard })
}

export const repayScene = new Scenes.WizardScene<MyContext>(
  "repay_wizard",
  // STEP 0: Loan selection
  async (ctx) => {
    const accountId = botState(ctx).accountId as string
    const isEarlyRepayment = botState(ctx).isEarlyRepayment as boolean
    const preFamilyId = botState(ctx).familyId

    if (!accountId) {
      await ctx.reply("❌ Session error: Missing account ID.")
      return ctx.scene.leave()
    }

    ctx.scene.session.isEarlyRepayment = isEarlyRepayment

    const supabase = createSupabaseAdmin()

    let profileIds: string[] = []
    if (preFamilyId) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("family_id", preFamilyId)
      profileIds = profiles?.map((p) => p.id) || []
    } else {
      const { data: households } = await supabase
        .from("households")
        .select(
          `
          families (
            id,
            profiles (id)
          )
        `,
        )
        .eq("id", accountId)
        .single()

      profileIds =
        households?.families?.flatMap((f) => f.profiles.map((p) => p.id)) || []
    }

    if (profileIds.length === 0) {
      await ctx.reply("❌ No profiles found for this account.")
      return ctx.scene.leave()
    }

    const { data: loans, error: loansError } = await supabase
      .from("loans")
      .select("id, name")
      .in("profile_id", profileIds)

    if (loansError || !loans || loans.length === 0) {
      await ctx.reply(
        "❌ No loans found. Create one in the web dashboard first.",
      )
      return ctx.scene.leave()
    }

    const repayLabel = isEarlyRepayment ? "early repayment" : "repayment"

    if (loans.length === 1) {
      ctx.scene.session.loanId = loans[0].id
      ctx.scene.session.loanName = loans[0].name

      const header = progressHeader(
        2,
        TOTAL_STEPS,
        `Logging ${repayLabel} for ${loans[0].name}`,
      )

      await ctx.reply(`${header}\n\nEnter the repayment amount:`)
      ctx.wizard.selectStep(STEP_AMOUNT)
      return
    }

    const buttons = loans.map((l) => [
      { text: l.name, callback_data: `loan_${l.id}` },
    ])

    const header = progressHeader(
      1,
      TOTAL_STEPS,
      `Logging ${repayLabel}`,
    )
    await ctx.reply(`${header}\n\nSelect a loan:`, {
      reply_markup: { inline_keyboard: buttons },
    })
    return ctx.wizard.next()
  },

  // STEP 1: Loan callback
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("loan_")) {
        const loanId = data.replace("loan_", "")
        const supabase = createSupabaseAdmin()
        const { data: loan } = await supabase
          .from("loans")
          .select("name")
          .eq("id", loanId)
          .single()
        ctx.scene.session.loanId = loanId
        ctx.scene.session.loanName = loan?.name ?? "Loan"
        await ctx.answerCbQuery()

        const repayLabel = ctx.scene.session.isEarlyRepayment
          ? "early repayment"
          : "repayment"
        const header = progressHeader(
          2,
          TOTAL_STEPS,
          `Logging ${repayLabel} for ${ctx.scene.session.loanName}`,
        )
        await ctx.reply(`${header}\n\nEnter the repayment amount:`)
        return ctx.wizard.next()
      }
    }

    if (ctx.scene.session.loanId && ctx.message && "text" in ctx.message) {
      return handleAmountInput(ctx)
    }

    return undefined
  },

  // STEP 2: Amount input
  async (ctx) => {
    return handleAmountInput(ctx)
  },

  // STEP 3: Confirmation
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()

      if (data === "cf") {
        const s = ctx.scene.session
        const loanId = s.loanId!
        const amount = s.amount!
        const isEarlyRepayment = s.isEarlyRepayment!
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
          const { error } = await supabase
            .from("loan_early_repayments")
            .insert({
              loan_id: loan.id,
              amount,
              date: today,
            })

          if (error) {
            await ctx.reply(`❌ Database error: ${error.message}`)
            return ctx.scene.leave()
          }

          await ctx.reply(
            `✅ Early repayment of ${fmtAmt(amount)} logged for ${loan.name}. Principal reduced.`,
          )
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

          await ctx.reply(
            `✅ Repayment of ${fmtAmt(amount)} logged for ${loan.name}.`,
          )
        }

        return ctx.scene.leave()
      }

      if (data === "cn") {
        await ctx.reply("Cancelled.")
        return ctx.scene.leave()
      }

      if (data === "ed_amt") {
        ctx.scene.session.editingField = "amount"
        ctx.wizard.selectStep(STEP_AMOUNT)
        await ctx.reply("Enter the new repayment amount:")
        return
      }
    }

    return undefined
  },
)

async function handleAmountInput(ctx: MyContext) {
  let amount: number | undefined

  // Handle quick-amount callback
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    const data = ctx.callbackQuery.data
    if (data.startsWith("qa_")) {
      amount = Number.parseFloat(data.replace("qa_", ""))
      await ctx.answerCbQuery()
    }
  }

  // Handle text input
  if (!amount && ctx.message && "text" in ctx.message) {
    amount = Number.parseFloat(ctx.message.text)
  }

  if (!amount || Number.isNaN(amount) || amount <= 0) {
    if (ctx.message && "text" in ctx.message) {
      await ctx.reply(
        errorMsg("Invalid amount. Enter a positive number.", "1500"),
      )
    }
    return undefined
  }

  ctx.scene.session.amount = amount

  const returned = await advanceOrReturn(ctx, STEP_CONFIRM, sendConfirmation)
  if (returned) return

  ctx.wizard.selectStep(STEP_CONFIRM)
  await sendConfirmation(ctx)
}
