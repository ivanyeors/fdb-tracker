import { format, startOfMonth, subMonths } from "date-fns"

import type { MyContext } from "@/lib/telegram/bot"

/**
 * Cancel middleware — register on the Stage so `/cancel` exits any active scene.
 */
export async function cancelMiddleware(
  ctx: MyContext,
  next: () => Promise<void>,
) {
  if (
    ctx.message &&
    "text" in ctx.message &&
    ctx.message.text.trim() === "/cancel"
  ) {
    if (ctx.scene.current) {
      await ctx.reply("Cancelled.")
      return ctx.scene.leave()
    }
  }
  return next()
}

/**
 * Progress header for scene prompts: "[2/4] Recording inflow for John"
 */
export function progressHeader(
  step: number,
  total: number,
  context: string,
): string {
  return `[${step}/${total}] ${context}`
}

/**
 * Build a confirmation summary message.
 */
export function buildConfirmationMessage(
  title: string,
  fields: Array<{ label: string; value: string }>,
): string {
  const divider = `--- ${title} ---`
  const rows = fields.map((f) => `${f.label}: ${f.value}`)
  return `${divider}\n${rows.join("\n")}\n\nTap ✅ Confirm to save, or edit a field below.`
}

/**
 * Build an inline keyboard for the confirmation step.
 */
export function buildConfirmationKeyboard(
  editableFields: Array<{ label: string; callbackData: string }>,
) {
  const actionRow = [
    { text: "✅ Confirm", callback_data: "cf" },
    { text: "❌ Cancel", callback_data: "cn" },
  ]
  const editRows = []
  for (let i = 0; i < editableFields.length; i += 2) {
    const row = [
      {
        text: `Edit ${editableFields[i].label}`,
        callback_data: editableFields[i].callbackData,
      },
    ]
    if (editableFields[i + 1]) {
      row.push({
        text: `Edit ${editableFields[i + 1].label}`,
        callback_data: editableFields[i + 1].callbackData,
      })
    }
    editRows.push(row)
  }
  return { inline_keyboard: [actionRow, ...editRows] }
}

/**
 * Build a month picker inline keyboard (current month + 5 previous).
 */
export function buildMonthPicker() {
  const now = new Date()
  const months: Array<{ label: string; value: string }> = []
  for (let i = 0; i < 6; i++) {
    const d = subMonths(now, i)
    months.push({
      label: format(d, "MMM yyyy"),
      value: format(startOfMonth(d), "yyyy-MM-dd"),
    })
  }
  const rows: Array<Array<{ text: string; callback_data: string }>> = []
  for (let i = 0; i < months.length; i += 3) {
    const row = months.slice(i, i + 3).map((m) => ({
      text: m.label,
      callback_data: `m_${m.value}`,
    }))
    rows.push(row)
  }
  return { inline_keyboard: rows }
}

/**
 * Parse a month callback value from the month picker.
 */
export function parseMonthCallback(data: string): {
  month: string
  monthLabel: string
} | null {
  if (!data.startsWith("m_")) return null
  const month = data.slice(2)
  const d = new Date(month + "T00:00:00")
  if (isNaN(d.getTime())) return null
  return { month, monthLabel: format(d, "MMMM yyyy") }
}

/**
 * Consistent error message with optional example.
 */
export function errorMsg(hint: string, example?: string): string {
  let msg = `❌ ${hint}`
  if (example) msg += `\nExample: ${example}`
  return msg
}

/**
 * Format a number as $1,234.56
 */
export function fmtAmt(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

/**
 * After collecting a field, either return to confirmation (if editing) or advance to next step.
 * Returns true if it jumped back to confirmation (caller should return), false if caller should call ctx.wizard.next().
 */
export async function advanceOrReturn(
  ctx: MyContext,
  confirmStepIndex: number,
  sendConfirmation: (ctx: MyContext) => Promise<void>,
): Promise<boolean> {
  if (ctx.scene.session.editingField) {
    ctx.scene.session.editingField = undefined
    ctx.wizard.selectStep(confirmStepIndex)
    await sendConfirmation(ctx)
    return true
  }
  return false
}

/**
 * Guard for text-only wizard steps. If the update is a callback query (i.e. the
 * user clicked an inline button on a stale message), answers the callback so
 * Telegram clears its loading spinner and replies with a short nudge. Returns
 * `true` when it handled a stray callback (caller should `return` early).
 */
export async function handleStrayCallback(
  ctx: MyContext,
  hint?: string,
): Promise<boolean> {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    try {
      await ctx.answerCbQuery()
    } catch {
      // Callback may already be expired; safe to ignore.
    }
    await ctx.reply(
      `Still waiting on ${hint ?? "your reply"}. Type the value or /cancel.`,
    )
    return true
  }
  return false
}

/**
 * Build quick-amount buttons for common values.
 */
export function buildQuickAmountKeyboard(
  amounts: number[],
  prefix: string = "qa",
) {
  const buttons = amounts.map((a) => ({
    text: fmtAmt(a),
    callback_data: `${prefix}_${a}`,
  }))
  return { inline_keyboard: [buttons] }
}
