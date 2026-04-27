import { Context, Scenes, Telegraf } from "telegraf"

export interface MySessionData extends Scenes.WizardSessionData {
  profileId?: string
  profileName?: string
  amount?: number
  symbol?: string
  quantity?: number
  price?: number
  type?: "buy" | "sell"
  productId?: string
  goalId?: string
  loanId?: string
  isEarlyRepayment?: boolean
  fileId?: string
  apiKeyId?: string
  householdId?: string
  familyId?: string
  expecting?: string
  /** Broker commission/fee for the trade. */
  commission?: number
  /** Selected investment account id for buy/sell. */
  accountId?: string
  /** Selected investment account name for display. */
  accountName?: string
  /** Optional note after /buy or /sell (Telegraf wizard). */
  journalNote?: string
  /** Selected month (yyyy-MM-dd) for cashflow, ILP, etc. */
  month?: string
  /** Display label for the selected month (e.g. "March 2026"). */
  monthLabel?: string
  /** Cashflow memo (deferred to confirmation). */
  memo?: string
  /** Cached goal name for confirmation display. */
  goalName?: string
  /** Cached loan name for confirmation display. */
  loanName?: string
  /** Cached ILP product name for confirmation display. */
  productName?: string
  /** ILP scene: target kind — single product or fund group. */
  ilpKind?: "individual" | "grouped"
  /** ILP scene: id of the selected product (individual) or fund group (grouped). */
  ilpTargetId?: string
  /** ILP scene: cached fund value already saved for the selected month (overwrite preview). */
  ilpCurrentMonthValue?: number | null
  /** ILP scene: latest fund value across all months for context. */
  ilpLatestValue?: number | null
  /** ILP scene: month string for the latest value above (yyyy-MM-dd). */
  ilpLatestMonth?: string | null
  /** ILP scene: cached member allocations for grouped ILP — used to distribute the new total on save. */
  ilpGroupAllocations?: Array<{ productId: string; allocationPct: number }>
  /** Stock company name from FMP search (for display in confirmation). */
  symbolName?: string
  /** Which field is being edited in the confirmation step. */
  editingField?: string
  /** PDF import: classified document type. */
  pdfDocType?: string
  /** PDF import: extracted structured data (JSON-serializable). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfExtracted?: Record<string, any>
  /** PDF import: classification confidence level. */
  pdfConfidence?: string
  /** PDF import: first 200 chars of raw text for debugging. */
  pdfRawTextPreview?: string
  /** Tax scene: year of assessment. */
  year?: number
  /** Signup code from deep link (persisted across requests). */
  signupCode?: string
  /** Join/invite code from deep link (persisted across requests). */
  joinCode?: string
}

/** Ephemeral keys on ctx.state (set before entering a scene). Telegraf types state as Record<string | symbol, any>. */
export interface BotWebhookState {
  otpChatId?: string
  linkApiKeyOrToken?: string | undefined
  accountId?: string
  /** Pre-resolved profile ID from linked Telegram account. */
  profileId?: string
  /** Pre-resolved family ID from linked Telegram account. */
  familyId?: string
  /** Account type: 'owner' for dashboard users, 'public' for Telegram-only users. */
  accountType?: "owner" | "public"
  type?: "buy" | "sell"
  isEarlyRepayment?: boolean
  fileId?: string
  symbol?: string
  /** Trailing text after `/in` or `/out` for optional one-line amount + memo (parsed in scene). */
  cashflowCommandRest?: string
  /** Trailing text after a command (e.g. "/tax 1694.50" → "1694.50"). */
  rest?: string
  /** Signup code from deep link (/start signup_CODE). */
  signupCode?: string
  /** Join/invite code from deep link (/start join_CODE). */
  joinCode?: string
}

export function botState(ctx: MyContext): BotWebhookState {
  return ctx.state as BotWebhookState
}

export interface MyContext extends Context {
  scene: Scenes.SceneContextScene<MyContext, MySessionData>
  wizard: Scenes.WizardContextWizard<MyContext>
}

let botInstance: Telegraf<MyContext> | null = null

export function getBot(): Telegraf<MyContext> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set")
  }
  if (!botInstance) {
    botInstance = new Telegraf<MyContext>(token, {
      telegram: { webhookReply: false },
    })
  }
  return botInstance
}

/** @deprecated Use getBot() for lazy init. Kept for backward compatibility. */
export const bot = new Proxy({} as Telegraf<MyContext>, {
  get(_, prop) {
    return Reflect.get(getBot(), prop)
  },
})

export async function sendMessage(chatId: string, text: string) {
  try {
    await getBot().telegram.sendMessage(chatId, text, { parse_mode: "HTML" })
  } catch (err) {
    const e = err as { message?: string; response?: { error_code?: number } }
    console.error("[telegram] sendMessage failed", {
      chatId,
      message: e?.message,
      errorCode: e?.response?.error_code,
    })
  }
}
