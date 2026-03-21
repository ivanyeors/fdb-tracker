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
  expecting?: string
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
  /** Which field is being edited in the confirmation step. */
  editingField?: string
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
  type?: "buy" | "sell"
  isEarlyRepayment?: boolean
  fileId?: string
  symbol?: string
  /** Trailing text after `/in` or `/out` for optional one-line amount + memo (parsed in scene). */
  cashflowCommandRest?: string
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
  await getBot().telegram.sendMessage(chatId, text, { parse_mode: "HTML" })
}
