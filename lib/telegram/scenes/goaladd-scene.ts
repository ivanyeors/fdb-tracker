import { Scenes } from "telegraf"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  buildQuickAmountKeyboard,
  errorMsg,
  fmtAmt,
  advanceOrReturn,
} from "@/lib/telegram/scene-helpers"

// Step indices (STEP_GOAL=0, STEP_GOAL_CB=1 are implicit first steps)
const STEP_AMOUNT = 2
const STEP_CONFIRM = 3
const TOTAL_STEPS = 2 // goal, amount

const QUICK_AMOUNTS = [100, 500, 1000] as const

async function sendConfirmation(ctx: MyContext) {
  const s = ctx.scene.session
  const goalName = s.goalName ?? "—"
  const amount = s.amount ?? 0

  const fields = [
    { label: "Goal", value: goalName },
    { label: "Amount", value: fmtAmt(amount) },
  ]

  const msg = buildConfirmationMessage("Confirm Goal Contribution", fields)
  const editFields = [
    { label: "Amount", callbackData: "ed_amt" },
  ]
  const keyboard = buildConfirmationKeyboard(editFields)
  await ctx.reply(msg, { reply_markup: keyboard })
}

export const goalAddScene = new Scenes.WizardScene<MyContext>(
  "goaladd_wizard",
  // STEP 0: Goal selection
  async (ctx) => {
    const accountId = botState(ctx).accountId as string
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

    const { data: goals, error: goalsError } = await supabase
      .from("savings_goals")
      .select("id, name, target_amount, current_amount")
      .in("family_id", familyIds)

    if (goalsError || !goals || goals.length === 0) {
      await ctx.reply(
        "❌ No savings goals found. Create one in the web dashboard first.",
      )
      return ctx.scene.leave()
    }

    if (goals.length === 1) {
      const g = goals[0]
      ctx.scene.session.goalId = g.id
      ctx.scene.session.goalName = g.name


      const header = progressHeader(2, TOTAL_STEPS, `Adding to ${g.name}`)
      const quickAmounts = buildQuickAmountKeyboard([...QUICK_AMOUNTS])
      await ctx.reply(
        `${header}\n\n${g.name} (${fmtAmt(g.current_amount)} / ${fmtAmt(g.target_amount)})\n\nEnter the amount to add, or pick a quick amount:`,
        { reply_markup: quickAmounts },
      )
      ctx.wizard.selectStep(STEP_AMOUNT)
      return
    }

    const buttons = goals.map((g) => [
      {
        text: `${g.name} (${fmtAmt(g.current_amount)}/${fmtAmt(g.target_amount)})`,
        callback_data: `goal_${g.id}`,
      },
    ])

    const header = progressHeader(1, TOTAL_STEPS, "Adding to savings goal")
    await ctx.reply(`${header}\n\nSelect a savings goal:`, {
      reply_markup: { inline_keyboard: buttons },
    })
    return ctx.wizard.next()
  },

  // STEP 1: Goal callback
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("goal_")) {
        const goalId = data.replace("goal_", "")
        ctx.scene.session.goalId = goalId
        await ctx.answerCbQuery()

        // Fetch goal details for display
        const supabase = createSupabaseAdmin()
        const { data: goal } = await supabase
          .from("savings_goals")
          .select("name, current_amount, target_amount")
          .eq("id", goalId)
          .single()

        if (goal) {
          ctx.scene.session.goalName = goal.name
        }

        const header = progressHeader(
          2,
          TOTAL_STEPS,
          `Adding to ${ctx.scene.session.goalName ?? "goal"}`,
        )
        const quickAmounts = buildQuickAmountKeyboard([...QUICK_AMOUNTS])
        await ctx.reply(
          `${header}\n\nEnter the amount to add, or pick a quick amount:`,
          { reply_markup: quickAmounts },
        )
        return ctx.wizard.next()
      }
    }
    return undefined
  },

  // STEP 2: Amount input (text or quick-amount callback)
  async (ctx) => {
    let amount: number | undefined

    // Handle quick-amount button
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
          errorMsg("Invalid amount. Enter a positive number.", "500"),
        )
      }
      return undefined
    }

    ctx.scene.session.amount = amount

    const returned = await advanceOrReturn(
      ctx,
      STEP_CONFIRM,
      sendConfirmation,
    )
    if (returned) return

    ctx.wizard.selectStep(STEP_CONFIRM)
    await sendConfirmation(ctx)
    return
  },

  // STEP 3: Confirmation
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()

      if (data === "cf") {
        const s = ctx.scene.session
        const goalId = s.goalId!
        const amount = s.amount!
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

        const pct =
          goal.target_amount > 0
            ? Math.round((newCurrent / goal.target_amount) * 100)
            : 0

        await ctx.reply(
          `✅ Added ${fmtAmt(amount)} to ${goal.name}. Progress: ${pct}% (${fmtAmt(newCurrent)}/${fmtAmt(goal.target_amount)}).`,
        )
        return ctx.scene.leave()
      }

      if (data === "cn") {
        await ctx.reply("Cancelled.")
        return ctx.scene.leave()
      }

      if (data === "ed_amt") {
        ctx.scene.session.editingField = "amount"
        ctx.wizard.selectStep(STEP_AMOUNT)
        const quickAmounts = buildQuickAmountKeyboard([...QUICK_AMOUNTS])
        await ctx.reply("Enter the new amount, or pick a quick amount:", {
          reply_markup: quickAmounts,
        })
        return
      }
    }

    return undefined
  },
)
