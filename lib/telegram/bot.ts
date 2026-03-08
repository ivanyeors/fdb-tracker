import { Telegraf } from "telegraf"

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || "")

export { bot }

export async function sendMessage(chatId: string, text: string) {
  await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML" })
}
