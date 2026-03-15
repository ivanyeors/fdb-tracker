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
  // Add other generic wizard session fields here
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
