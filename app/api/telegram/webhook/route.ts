import { NextRequest, NextResponse } from "next/server"

import { getBot } from "@/lib/telegram/bot"
import { getOrCreateAccountForChat } from "@/lib/auth/account"
import { generateAndStoreOtp } from "@/lib/auth/otp"
import { handleInflow } from "@/lib/telegram/commands/inflow"
import { handleOutflow } from "@/lib/telegram/commands/outflow"
import { handleBuy } from "@/lib/telegram/commands/buy"
import { handleSell } from "@/lib/telegram/commands/sell"
import { handleStockImg } from "@/lib/telegram/commands/stockimg"
import { handleIlp } from "@/lib/telegram/commands/ilp"
import { handleGoaladd } from "@/lib/telegram/commands/goaladd"
import { handleRepay } from "@/lib/telegram/commands/repay"
import { handleEarlyrepay } from "@/lib/telegram/commands/earlyrepay"

type CommandHandler = (accountId: string, text: string) => Promise<string>

const textCommands: Record<string, CommandHandler> = {
  in: handleInflow,
  out: handleOutflow,
  buy: handleBuy,
  sell: handleSell,
  ilp: handleIlp,
  goaladd: handleGoaladd,
  repay: handleRepay,
  earlyrepay: handleEarlyrepay,
}

function extractCommand(text: string): { command: string; rest: string } | null {
  const match = text.match(/^\/(\w+)(@\S+)?\s*([\s\S]*)$/)
  if (!match) return null
  return { command: match[1], rest: match[3] ?? "" }
}

async function resolveAccount(chatId: number): Promise<string | null> {
  const account = await getOrCreateAccountForChat(String(chatId))
  return account.ok ? account.accountId : null
}

async function handleOtpCommand(
  chat: { id: number; type: string },
  fromUserId: number | null,
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  console.log(
    "[telegram/otp] handleOtpCommand called:",
    JSON.stringify({ chatId: chat.id, chatType: chat.type, fromUserId }),
  )
  try {
    const account = await getOrCreateAccountForChat(String(chat.id))
    if (!account.ok) {
      console.error(
        "[telegram/otp] Account resolution failed:",
        JSON.stringify({ chatId: chat.id, stage: account.stage, error: account.error }),
      )
      await reply("❌ Login is temporarily unavailable. Please try again shortly.")
      return
    }

    const result = await generateAndStoreOtp(account.accountId)
    if (!result.ok) {
      console.error(
        "[telegram/otp] OTP creation failed:",
        JSON.stringify({ chatId: chat.id, stage: result.stage, error: result.error }),
      )
      await reply(`❌ ${result.error}`)
      return
    }

    await reply(`🔑 Your OTP: ${result.otp}`)
  } catch (err) {
    console.error("[telegram/otp] OTP error:", err)
    try {
      await reply("❌ Something went wrong. Check server logs.")
    } catch (replyErr) {
      console.error("[telegram/otp] Failed to send error reply:", replyErr)
    }
  }
}

async function handleStartCommand(
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  await reply(
    "👋 Welcome! Send /otp to get your login code, then enter it on the login page.",
  )
}

let handlersRegistered = false

function ensureHandlers() {
  if (handlersRegistered) return
  handlersRegistered = true

  const bot = getBot()

  bot.catch((err) => {
    console.error("[telegram/webhook] Bot error:", err)
  })

  bot.on("message", async (ctx) => {
    const msg = ctx.message
    if (!("text" in msg) || !msg.text) return

    const parsed = extractCommand(msg.text)
    if (!parsed) return

    const chatId = msg.chat.id

    if (parsed.command === "start") {
      await handleStartCommand((text) => bot.telegram.sendMessage(chatId, text))
      return
    }

    if (parsed.command === "otp") {
      await handleOtpCommand(msg.chat, msg.from?.id ?? null, (text) =>
        bot.telegram.sendMessage(chatId, text),
      )
      return
    }

    const accountId = await resolveAccount(chatId)
    if (!accountId) {
      await ctx.reply("❌ Something went wrong. Please try /otp first to set up your account.")
      return
    }

    if (parsed.command === "stockimg") {
      let fileId: string | undefined
      if ("photo" in msg && Array.isArray(msg.photo) && msg.photo.length > 0) {
        fileId = (msg.photo[msg.photo.length - 1] as { file_id: string }).file_id
      } else if (
        "reply_to_message" in msg &&
        msg.reply_to_message &&
        "photo" in msg.reply_to_message &&
        Array.isArray(msg.reply_to_message.photo) &&
        msg.reply_to_message.photo.length > 0
      ) {
        const photos = msg.reply_to_message.photo as Array<{ file_id: string }>
        fileId = photos[photos.length - 1].file_id
      }
      const reply = await handleStockImg(accountId, msg.text, fileId)
      await ctx.reply(reply)
      return
    }

    const handler = textCommands[parsed.command]
    if (handler) {
      const reply = await handler(accountId, msg.text)
      await ctx.reply(reply)
    }
  })

  bot.on("channel_post", async (ctx) => {
    const post = ctx.channelPost
    if (!("text" in post) || !post.text) return

    const parsed = extractCommand(post.text)
    if (!parsed) return

    const chatId = ctx.chat.id

    if (parsed.command === "start") {
      await handleStartCommand((text) =>
        bot.telegram.sendMessage(chatId, text),
      )
      return
    }

    if (parsed.command === "otp") {
      await handleOtpCommand(ctx.chat, null, (text) =>
        bot.telegram.sendMessage(chatId, text),
      )
      return
    }

    const accountId = await resolveAccount(chatId)
    if (!accountId) {
      await bot.telegram.sendMessage(
        chatId,
        "❌ Something went wrong. Please try /otp first to set up your account.",
      )
      return
    }

    if (parsed.command === "stockimg") {
      let fileId: string | undefined
      if ("photo" in post && Array.isArray(post.photo) && post.photo.length > 0) {
        fileId = (post.photo[post.photo.length - 1] as { file_id: string }).file_id
      }
      const reply = await handleStockImg(accountId, post.text, fileId)
      await bot.telegram.sendMessage(chatId, reply)
      return
    }

    const handler = textCommands[parsed.command]
    if (handler) {
      const reply = await handler(accountId, post.text)
      await bot.telegram.sendMessage(chatId, reply)
    }
  })
}

export async function POST(request: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("[telegram/webhook] TELEGRAM_BOT_TOKEN is not set")
    return NextResponse.json(
      { error: "Telegram bot not configured" },
      { status: 503 },
    )
  }

  const bot = getBot()
  ensureHandlers()

  try {
    const body = await request.json()
    await bot.handleUpdate(body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[telegram/webhook] Error handling update:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
