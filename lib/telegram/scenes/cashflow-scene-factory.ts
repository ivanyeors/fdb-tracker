import { Scenes } from "telegraf"
import { format, startOfMonth } from "date-fns"

import { encodeMonthlyCashflowPiiPatch } from "@/lib/repos/monthly-cashflow"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import { sanitizeText } from "@/lib/telegram/sanitize"
import {
  parseAmountAndMemoFromRest,
  parseCashflowOneLine,
} from "@/lib/telegram/parse-cashflow-command-rest"
import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  buildMonthPicker,
  parseMonthCallback,
  errorMsg,
  fmtAmt,
  advanceOrReturn,
  handleStrayCallback,
} from "@/lib/telegram/scene-helpers"

// Step indices (STEP_PROFILE=0, STEP_PROFILE_CB=1 are implicit first steps)
const STEP_MONTH = 2
const STEP_AMOUNT = 3
const STEP_MEMO = 4
const STEP_CONFIRM = 5
const TOTAL_STEPS = 4 // user-visible steps: profile, month, amount, memo

type CashflowType = "inflow" | "outflow"

function label(type: CashflowType) {
  return type === "inflow" ? "inflow" : "outflow"
}

function exampleMemo(type: CashflowType) {
  return type === "inflow" ? "salary" : "groceries"
}

async function sendConfirmation(ctx: MyContext, type: CashflowType) {
  const s = ctx.scene.session
  const fields = [
    { label: "Profile", value: s.profileName ?? "—" },
    { label: "Month", value: s.monthLabel ?? "—" },
    { label: "Amount", value: s.amount != null ? fmtAmt(s.amount) : "—" },
  ]
  if (s.memo) {
    fields.push({ label: "Memo", value: s.memo })
  }

  const msg = buildConfirmationMessage(`Confirm ${label(type)}`, fields)
  const editFields = [
    { label: "Month", callbackData: "ed_month" },
    { label: "Amount", callbackData: "ed_amt" },
    { label: "Memo", callbackData: "ed_memo" },
  ]
  const keyboard = buildConfirmationKeyboard(editFields)

  await ctx.reply(msg, { reply_markup: keyboard })
}

export function createCashflowScene(type: CashflowType) {
  return new Scenes.WizardScene<MyContext>(
    `${type}_wizard`,
    // STEP 0: Profile selection
    async (ctx) => {
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
        await ctx.reply(
          "❌ No profiles found. Create one in the web dashboard first."
        )
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

      // Set default month
      const now = new Date()
      ctx.scene.session.month = format(startOfMonth(now), "yyyy-MM-dd")
      ctx.scene.session.monthLabel = format(now, "MMMM yyyy")

      // Try one-line shortcut
      const commandRest = botState(ctx).cashflowCommandRest?.trim()
      if (commandRest) {
        delete botState(ctx).cashflowCommandRest
        const one = parseCashflowOneLine(commandRest, profiles)
        if (one) {
          ctx.scene.session.profileId = one.profileId
          ctx.scene.session.profileName = one.profileName
          ctx.scene.session.amount = one.amount
          if (one.memo) ctx.scene.session.memo = sanitizeText(one.memo)
          // Jump to confirmation
          ctx.wizard.selectStep(STEP_CONFIRM)
          await sendConfirmation(ctx, type)
          return
        }
        await ctx.reply(
          `ℹ️ Could not parse that message. Try \`/${type === "inflow" ? "in" : "out"} 5000\` or \`/${type === "inflow" ? "in" : "out"} YourName 5000 short note\`, or continue below.`
        )
      }

      if (profiles.length === 1) {
        ctx.scene.session.profileId = profiles[0].id
        ctx.scene.session.profileName = profiles[0].name

        // If editing, return to confirmation
        if (ctx.scene.session.editingField) {
          ctx.scene.session.editingField = undefined
          ctx.wizard.selectStep(STEP_CONFIRM)
          await sendConfirmation(ctx, type)
          return
        }

        const header = progressHeader(
          1,
          TOTAL_STEPS,
          `Recording ${label(type)}`
        )
        await ctx.reply(
          `${header}\n\nSelected profile: ${profiles[0].name}\n\nSelect the month:`,
          { reply_markup: buildMonthPicker() }
        )
        ctx.wizard.selectStep(STEP_MONTH)
        return
      }

      const buttons = profiles.map((p) => [
        { text: p.name, callback_data: `profile_${p.id}` },
      ])

      const header = progressHeader(1, TOTAL_STEPS, `Recording ${label(type)}`)
      await ctx.reply(`${header}\n\nSelect a profile:`, {
        reply_markup: { inline_keyboard: buttons },
      })
      return ctx.wizard.next()
    },

    // STEP 1: Profile callback handler
    async (ctx) => {
      if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
        const data = ctx.callbackQuery.data
        if (data.startsWith("profile_")) {
          const profileId = data.replace("profile_", "")
          const supabase = createSupabaseAdmin()
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", profileId)
            .single()
          ctx.scene.session.profileId = profileId
          ctx.scene.session.profileName = profile?.name ?? ""
          await ctx.answerCbQuery()

          const header = progressHeader(
            2,
            TOTAL_STEPS,
            `Recording ${label(type)} for ${ctx.scene.session.profileName}`
          )
          await ctx.reply(`${header}\n\nSelect the month:`, {
            reply_markup: buildMonthPicker(),
          })
          return ctx.wizard.next()
        }
      }
      return undefined
    },

    // STEP 2: Month selection
    async (ctx) => {
      if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
        const parsed = parseMonthCallback(ctx.callbackQuery.data)
        if (parsed) {
          ctx.scene.session.month = parsed.month
          ctx.scene.session.monthLabel = parsed.monthLabel
          await ctx.answerCbQuery()

          const returned = await advanceOrReturn(ctx, STEP_CONFIRM, (c) =>
            sendConfirmation(c, type)
          )
          if (returned) return

          const header = progressHeader(
            3,
            TOTAL_STEPS,
            `Recording ${label(type)} for ${ctx.scene.session.profileName}`
          )
          await ctx.reply(
            `${header}\n\nMonth: ${parsed.monthLabel}\n\nEnter the ${label(type)} amount:`
          )
          return ctx.wizard.next()
        }
      }

      // Also accept text input for month step if user types instead
      if (ctx.message && "text" in ctx.message) {
        await ctx.reply("Please select a month from the buttons above.")
      }
      return undefined
    },

    // STEP 3: Amount input
    async (ctx) => {
      if (await handleStrayCallback(ctx, "the amount")) return
      if (!ctx.message || !("text" in ctx.message)) return undefined

      const text = ctx.message.text.trim()
      const parsed = parseAmountAndMemoFromRest(text)
      if (!parsed) {
        await ctx.reply(
          errorMsg(
            "Invalid amount. Enter a positive number, optionally followed by a short note.",
            `5000 ${exampleMemo(type)}`
          )
        )
        return undefined
      }

      ctx.scene.session.amount = parsed.amount
      if (parsed.memo) ctx.scene.session.memo = sanitizeText(parsed.memo)

      const returned = await advanceOrReturn(ctx, STEP_CONFIRM, (c) =>
        sendConfirmation(c, type)
      )
      if (returned) return

      if (parsed.memo) {
        // Already have memo, go to confirmation
        ctx.wizard.selectStep(STEP_CONFIRM)
        await sendConfirmation(ctx, type)
        return
      }

      const header = progressHeader(
        4,
        TOTAL_STEPS,
        `Recording ${label(type)} for ${ctx.scene.session.profileName}`
      )
      await ctx.reply(
        `${header}\n\n💭 Anything to remember for this month? Reply with a short note, or send /skip.`
      )
      return ctx.wizard.next()
    },

    // STEP 4: Optional memo
    async (ctx) => {
      if (await handleStrayCallback(ctx, "a memo (or /skip)")) return
      if (!ctx.message || !("text" in ctx.message)) return undefined
      const t = ctx.message.text.trim()

      if (t === "/skip" || t.toLowerCase() === "skip") {
        ctx.scene.session.memo = undefined
      } else {
        ctx.scene.session.memo = sanitizeText(t)
      }

      const returned = await advanceOrReturn(ctx, STEP_CONFIRM, (c) =>
        sendConfirmation(c, type)
      )
      if (returned) return

      ctx.wizard.selectStep(STEP_CONFIRM)
      await sendConfirmation(ctx, type)
      return
    },

    // STEP 5: Confirmation
    async (ctx) => {
      if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
        const data = ctx.callbackQuery.data
        await ctx.answerCbQuery()

        if (data === "cf") {
          // Confirm — save to DB
          const s = ctx.scene.session
          const supabase = createSupabaseAdmin()

          const base = {
            profile_id: s.profileId!,
            month: s.month!,
            source: "telegram",
            updated_at: new Date().toISOString(),
          }

          const upsertData =
            type === "inflow"
              ? {
                  ...base,
                  ...encodeMonthlyCashflowPiiPatch({ inflow: s.amount! }),
                  ...(s.memo ? { inflow_memo: s.memo } : {}),
                }
              : {
                  ...base,
                  ...encodeMonthlyCashflowPiiPatch({ outflow: s.amount! }),
                  ...(s.memo ? { outflow_memo: s.memo } : {}),
                }

          const { error } = await supabase
            .from("monthly_cashflow")
            .upsert(upsertData, { onConflict: "profile_id,month" })

          if (error) {
            await ctx.reply(`❌ Database error: ${error.message}`)
            return ctx.scene.leave()
          }

          let msg = `✅ Added ${label(type)} of ${fmtAmt(s.amount!)} for ${s.profileName} (${s.monthLabel}).`
          if (s.memo) msg += "\n📝 Note saved."

          // Show updated primary account balance
          try {
            const { computeAccountBalance } = await import(
              "@/lib/calculations/computed-bank-balance"
            )
            const { data: profile } = await supabase
              .from("profiles")
              .select("primary_bank_account_id")
              .eq("id", s.profileId!)
              .single()
            if (profile?.primary_bank_account_id) {
              const computed = await computeAccountBalance(
                supabase,
                profile.primary_bank_account_id,
              )
              msg += `\n💰 Primary account balance: ${fmtAmt(computed.balance)}`
            }
          } catch {
            // Balance display is best-effort — don't block on errors
          }

          await ctx.reply(msg)

          // Cross-prompt: suggest logging the opposite direction
          const oppLabel = type === "inflow" ? "outflow" : "inflow"
          const oppScene = type === "inflow" ? "out" : "in"
          await ctx.reply(`💡 Log ${oppLabel} for ${s.monthLabel} too?`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: `Yes, log ${oppLabel}`, callback_data: `cross_${oppScene}_${s.profileId}_${s.month}` }],
                [{ text: "Done", callback_data: "cross_skip" }],
              ],
            },
          })

          return ctx.scene.leave()
        }

        if (data === "cn") {
          await ctx.reply("Cancelled.")
          return ctx.scene.leave()
        }

        // Edit handlers
        if (data === "ed_month") {
          ctx.scene.session.editingField = "month"
          ctx.wizard.selectStep(STEP_MONTH)
          const header = progressHeader(
            2,
            TOTAL_STEPS,
            `Editing month for ${label(type)}`
          )
          await ctx.reply(`${header}\n\nSelect a new month:`, {
            reply_markup: buildMonthPicker(),
          })
          return
        }

        if (data === "ed_amt") {
          ctx.scene.session.editingField = "amount"
          ctx.wizard.selectStep(STEP_AMOUNT)
          const header = progressHeader(
            3,
            TOTAL_STEPS,
            `Editing amount for ${label(type)}`
          )
          await ctx.reply(`${header}\n\nEnter the new ${label(type)} amount:`)
          return
        }

        if (data === "ed_memo") {
          ctx.scene.session.editingField = "memo"
          ctx.wizard.selectStep(STEP_MEMO)
          const header = progressHeader(
            4,
            TOTAL_STEPS,
            `Editing memo for ${label(type)}`
          )
          await ctx.reply(
            `${header}\n\nEnter a new memo, or send /skip to remove it.`
          )
          return
        }
      }

      return undefined
    }
  )
}

export const inflowScene = createCashflowScene("inflow")
export const outflowScene = createCashflowScene("outflow")
