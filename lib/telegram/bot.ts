import type { Context } from "telegraf"
import { Telegraf } from "telegraf"

let botInstance: Telegraf<Context> | null = null

export function getBot(): Telegraf<Context> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set")
  }
  if (!botInstance) {
    botInstance = new Telegraf(token)
  }
  return botInstance
}

/** @deprecated Use getBot() for lazy init. Kept for backward compatibility. */
export const bot = new Proxy({} as Telegraf<Context>, {
  get(_, prop) {
    return Reflect.get(getBot(), prop)
  },
})

export async function sendMessage(chatId: string, text: string) {
  await getBot().telegram.sendMessage(chatId, text, { parse_mode: "HTML" })
}
