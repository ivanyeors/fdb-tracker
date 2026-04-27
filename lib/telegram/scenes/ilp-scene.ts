import { Scenes } from "telegraf"
import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import { resolveOrProvisionPublicUser } from "@/lib/telegram/resolve-household"
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

// Step indices (STEP_PRODUCT=0, STEP_PRODUCT_CB=1 are implicit first steps)
const STEP_MONTH = 2
const STEP_VALUE = 3
const STEP_CONFIRM = 4
const TOTAL_STEPS = 3 // product, month, value

async function sendConfirmation(ctx: MyContext) {
  const s = ctx.scene.session
  const fields = [
    { label: "Product", value: s.productName ?? "—" },
    { label: "Month", value: s.monthLabel ?? "—" },
    {
      label: "Fund Value",
      value: s.amount != null ? fmtAmt(s.amount) : "—",
    },
  ]

  const msg = buildConfirmationMessage("Confirm ILP Update", fields)
  const editFields = [
    { label: "Month", callbackData: "ed_month" },
    { label: "Value", callbackData: "ed_val" },
  ]
  const keyboard = buildConfirmationKeyboard(editFields)
  await ctx.reply(msg, { reply_markup: keyboard })
}

export const ilpScene = new Scenes.WizardScene<MyContext>(
  "ilp_wizard",
  // STEP 0: Product selection
  async (ctx) => {
    const state = botState(ctx)
    let accountId = state.accountId
    let preFamilyId = state.familyId

    // Fallback: if the wizard was entered without setBotContext() running this
    // turn (e.g. session resumed across webhooks), re-resolve from chat/user.
    if (!accountId && ctx.chat?.id != null) {
      const resolved = await resolveOrProvisionPublicUser(
        String(ctx.chat.id),
        ctx.from?.id != null ? String(ctx.from.id) : null,
        ctx.from?.username ?? null,
        ctx.from?.first_name ?? null
      )
      if (resolved) {
        accountId = resolved.householdId
        preFamilyId = preFamilyId ?? resolved.familyId
        state.accountId = accountId
        state.familyId = preFamilyId
        state.profileId = state.profileId ?? resolved.profileId
        state.accountType = state.accountType ?? resolved.accountType
      }
    }

    if (!accountId) {
      console.error("[ilp-scene] Could not resolve account", {
        chatId: ctx.chat?.id,
        fromUserId: ctx.from?.id,
      })
      await ctx.reply(
        "❌ Could not resolve your account. Please send /start and try /ilp again."
      )
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

    const { data: products, error: productsError } = await supabase
      .from("ilp_products")
      .select("id, name")
      .in("family_id", familyIds)

    if (productsError || !products || products.length === 0) {
      await ctx.reply(
        "❌ No ILP products found. Create one in the web dashboard first.",
      )
      return ctx.scene.leave()
    }

    // Set default month
    const now = new Date()
    ctx.scene.session.month = format(startOfMonth(now), "yyyy-MM-dd")
    ctx.scene.session.monthLabel = format(now, "MMMM yyyy")

    if (products.length === 1) {
      ctx.scene.session.productId = products[0].id
      ctx.scene.session.productName = products[0].name

      const header = progressHeader(2, TOTAL_STEPS, `Updating ${products[0].name}`)
      await ctx.reply(`${header}\n\nSelect the month:`, {
        reply_markup: buildMonthPicker(),
      })
      ctx.wizard.selectStep(STEP_MONTH)
      return
    }

    const buttons = products.map((p) => [
      { text: p.name, callback_data: `ilp_${p.id}` },
    ])

    const header = progressHeader(1, TOTAL_STEPS, "Updating ILP fund value")
    await ctx.reply(`${header}\n\nSelect an ILP Product:`, {
      reply_markup: { inline_keyboard: buttons },
    })
    return ctx.wizard.next()
  },

  // STEP 1: Product callback
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("ilp_")) {
        const productId = data.replace("ilp_", "")
        const supabase = createSupabaseAdmin()
        const { data: product } = await supabase
          .from("ilp_products")
          .select("name")
          .eq("id", productId)
          .single()
        ctx.scene.session.productId = productId
        ctx.scene.session.productName = product?.name ?? "ILP Product"
        await ctx.answerCbQuery()

        const header = progressHeader(
          2,
          TOTAL_STEPS,
          `Updating ${ctx.scene.session.productName}`,
        )
        await ctx.reply(`${header}\n\nSelect the month:`, {
          reply_markup: buildMonthPicker(),
        })
        return ctx.wizard.next()
      }
    }
    if (ctx.message && "text" in ctx.message) {
      await ctx.reply("Please tap one of the product buttons above.")
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

        const returned = await advanceOrReturn(
          ctx,
          STEP_CONFIRM,
          sendConfirmation,
        )
        if (returned) return

        const header = progressHeader(
          3,
          TOTAL_STEPS,
          `Updating ${ctx.scene.session.productName} — ${parsed.monthLabel}`,
        )
        await ctx.reply(`${header}\n\nEnter the new fund value:`)
        return ctx.wizard.next()
      }
      // Unknown callback — acknowledge so the spinner clears.
      await handleStrayCallback(ctx, "a month")
      return undefined
    }

    if (ctx.message && "text" in ctx.message) {
      await ctx.reply("Please select a month from the buttons above.")
    }
    return undefined
  },

  // STEP 3: Fund value input
  async (ctx) => {
    if (await handleStrayCallback(ctx, "the new fund value")) return
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const value = Number.parseFloat(ctx.message.text)
    if (Number.isNaN(value) || value < 0) {
      await ctx.reply(
        errorMsg("Invalid value. Enter a positive number.", "12500"),
      )
      return undefined
    }

    ctx.scene.session.amount = value

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

  // STEP 4: Confirmation
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()

      if (data === "cf") {
        const s = ctx.scene.session
        const supabase = createSupabaseAdmin()

        const { error } = await supabase.from("ilp_entries").upsert(
          {
            product_id: s.productId!,
            month: s.month!,
            fund_value: s.amount!,
          },
          { onConflict: "product_id,month" },
        )

        if (error) {
          console.error("[ilp-scene] upsert failed", {
            productId: s.productId,
            month: s.month,
            code: error.code,
            details: error.details,
            message: error.message,
          })
          await ctx.reply(
            `❌ Save failed${error.code ? ` (${error.code})` : ""}: ${error.message}`
          )
          return ctx.scene.leave()
        }

        await ctx.reply(
          `✅ ${s.productName} fund value set to ${fmtAmt(s.amount!)} for ${s.monthLabel}.`,
        )
        return ctx.scene.leave()
      }

      if (data === "cn") {
        await ctx.reply("Cancelled.")
        return ctx.scene.leave()
      }

      if (data === "ed_month") {
        ctx.scene.session.editingField = "month"
        ctx.wizard.selectStep(STEP_MONTH)
        await ctx.reply("Select a new month:", {
          reply_markup: buildMonthPicker(),
        })
        return
      }

      if (data === "ed_val") {
        ctx.scene.session.editingField = "value"
        ctx.wizard.selectStep(STEP_VALUE)
        await ctx.reply("Enter the new fund value:")
        return
      }
    }

    return undefined
  },
)
