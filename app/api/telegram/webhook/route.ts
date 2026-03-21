import { NextRequest, NextResponse } from "next/server"

import { Scenes, session } from "telegraf"

import { botState, getBot, MyContext } from "@/lib/telegram/bot"
import { generateAndStoreOtp } from "@/lib/auth/otp"
import {
  resolveHouseholdId,
  getOrCreateAccount,
} from "@/lib/telegram/resolve-household"
import { supabaseSessionStore } from "@/lib/telegram/session"
import { inflowScene } from "@/lib/telegram/scenes/inflow-scene"
import { outflowScene } from "@/lib/telegram/scenes/outflow-scene"
import { buySellScene } from "@/lib/telegram/scenes/buy-sell-scene"
import { ilpScene } from "@/lib/telegram/scenes/ilp-scene"
import { goalAddScene } from "@/lib/telegram/scenes/goaladd-scene"
import { repayScene } from "@/lib/telegram/scenes/repay-scene"
import { stockImgScene } from "@/lib/telegram/scenes/stockimg-scene"
import { authScene } from "@/lib/telegram/scenes/auth-scene"
import { linkApiScene } from "@/lib/telegram/scenes/link-api-scene"
import { otpScene } from "@/lib/telegram/scenes/otp-scene"

type CommandHandler = (accountId: string, text: string) => Promise<string>

const textCommands: Record<string, CommandHandler> = {}

function extractCommand(text: string): { command: string; rest: string } | null {
  const match = text.match(/^\/(\w+)(@\S+)?\s*([\s\S]*)$/)
  if (!match) return null
  return { command: match[1], rest: match[3] ?? "" }
}

async function handleStartCommand(
  chatId: string,
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  const accountId = await getOrCreateAccount(chatId)
  if (!accountId) {
    await reply("❌ Something went wrong setting up your account. Please try again.")
    return
  }
  await reply(
    "👋 Welcome to fdb-tracker!\n\n" +
      "Use /otp to get a one-time password for logging in.\n" +
      "Use /link to link your profile — I'll guide you through it.\n" +
      "Use /auth to link your account with an API key from the platform.\n" +
      "Type / to see all available commands.",
  )
}

async function handleOtpCommand(ctx: MyContext): Promise<void> {
  const chat = ctx.chat
  if (!chat) {
    await ctx.reply("❌ Could not resolve chat.")
    return
  }
  const fromUserId = ctx.from?.id ?? null
  const telegramUsername = ctx.from?.username ?? null

  console.log(
    "[telegram/otp] handleOtpCommand called:",
    JSON.stringify({ chatId: chat.id, chatType: chat.type, fromUserId, telegramUsername }),
  )
  try {
    const accountId = await resolveHouseholdId(
      String(chat.id),
      fromUserId != null ? String(fromUserId) : null,
      { telegramUsername, allowCreate: false },
    )

    if (accountId) {
      console.log("[telegram/otp] Account resolved:", JSON.stringify({ chatId: chat.id, accountId }))

      const result = await generateAndStoreOtp(accountId)
      console.log("[telegram/otp] generateAndStoreOtp result:", JSON.stringify(result))
      if (!result.ok) {
        console.error("[telegram/otp] OTP creation failed:", JSON.stringify(result))
        await ctx.reply(`❌ ${result.error}`)
        return
      }

      console.log("[telegram/otp] Sending OTP reply to chatId:", chat.id)
      await ctx.reply(`${result.otp}`)
      console.log("[telegram/otp] OTP reply sent successfully")
      return
    }

    botState(ctx).otpChatId = String(chat.id)
    await ctx.scene.enter("otp_wizard")
  } catch (err) {
    console.error("[telegram/otp] OTP error:", err)
    try {
      await ctx.reply("❌ Something went wrong. Check server logs.")
    } catch (replyErr) {
      console.error("[telegram/otp] Failed to send error reply:", replyErr)
    }
  }
}

let handlersRegistered = false

function ensureHandlers() {
  if (handlersRegistered) return
  handlersRegistered = true

  const bot = getBot()

  const stage = new Scenes.Stage<MyContext>([
    inflowScene,
    outflowScene,
    buySellScene,
    ilpScene,
    goalAddScene,
    repayScene,
    stockImgScene,
    authScene,
    linkApiScene,
    otpScene,
  ])

  bot.use(session({ store: supabaseSessionStore }))
  bot.use(stage.middleware())

  bot.catch((err) => {
    console.error("[telegram/webhook] Bot error:", err)
  })

  bot.on("message", async (ctx) => {
    const msg = ctx.message
    console.log("[telegram/webhook] bot.on('message') triggered, chat.id:", msg.chat.id, "chat.type:", msg.chat.type)

    if (!("text" in msg) || !msg.text) {
      console.log("[telegram/webhook] No text in message, ignoring")
      return
    }

    console.log("[telegram/webhook] Message text:", msg.text)
    const parsed = extractCommand(msg.text)
    if (!parsed) {
      console.log("[telegram/webhook] Not a command, ignoring")
      return
    }

    console.log("[telegram/webhook] Parsed command:", parsed.command)
    const chatId = msg.chat.id

    if (parsed.command === "start") {
      await handleStartCommand(String(chatId), (text) =>
        bot.telegram.sendMessage(chatId, text),
      )
      return
    }

    if (parsed.command === "auth") {
      botState(ctx).linkApiKeyOrToken = undefined
      await ctx.scene.enter("auth_wizard")
      return
    }

    if (parsed.command === "link") {
      botState(ctx).linkApiKeyOrToken = undefined
      await ctx.scene.enter("link_api_wizard")
      return
    }

    if (parsed.command === "otp") {
      await handleOtpCommand(ctx)
      return
    }

    const accountId = await resolveHouseholdId(
      String(chatId),
      msg.from?.id != null ? String(msg.from.id) : null,
    )
    if (!accountId) {
      await ctx.reply("❌ Could not resolve your account. Use /link or /auth to link first, or /otp to set up.")
      return
    }

    if (parsed.command === "in") {
      botState(ctx).accountId = accountId
      botState(ctx).cashflowCommandRest = parsed.rest
      await ctx.scene.enter("inflow_wizard")
      return
    }

    if (parsed.command === "out") {
      botState(ctx).accountId = accountId
      botState(ctx).cashflowCommandRest = parsed.rest
      await ctx.scene.enter("outflow_wizard")
      return
    }

    if (parsed.command === "buy") {
      botState(ctx).accountId = accountId
      botState(ctx).type = "buy"
      await ctx.scene.enter("buy_sell_wizard")
      return
    }
    
    if (parsed.command === "sell") {
      botState(ctx).accountId = accountId
      botState(ctx).type = "sell"
      await ctx.scene.enter("buy_sell_wizard")
      return
    }

    if (parsed.command === "ilp") {
      botState(ctx).accountId = accountId
      await ctx.scene.enter("ilp_wizard")
      return
    }

    if (parsed.command === "goaladd") {
      botState(ctx).accountId = accountId
      await ctx.scene.enter("goaladd_wizard")
      return
    }

    if (parsed.command === "repay") {
      botState(ctx).accountId = accountId
      botState(ctx).isEarlyRepayment = false
      await ctx.scene.enter("repay_wizard")
      return
    }

    if (parsed.command === "earlyrepay") {
      botState(ctx).accountId = accountId
      botState(ctx).isEarlyRepayment = true
      await ctx.scene.enter("repay_wizard")
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
      
      const st = botState(ctx)
      st.accountId = accountId
      if (fileId) st.fileId = fileId
      if (parsed.rest.trim()) st.symbol = parsed.rest.trim().toUpperCase()
      
      await ctx.scene.enter("stockimg_wizard")
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
    console.log("[telegram/webhook] bot.on('channel_post') triggered, chat.id:", ctx.chat.id)

    if (!("text" in post) || !post.text) return

    const parsed = extractCommand(post.text)
    if (!parsed) return

    console.log("[telegram/webhook] Channel post command:", parsed.command)

    if (parsed.command === "start") {
      await handleStartCommand(String(ctx.chat.id), (text) =>
        bot.telegram.sendMessage(ctx.chat.id, text),
      )
      return
    }

    if (parsed.command === "otp") {
      await handleOtpCommand(ctx)
      return
    }

    if (parsed.command === "auth") {
      botState(ctx).linkApiKeyOrToken = undefined
      await ctx.scene.enter("auth_wizard")
      return
    }

    if (parsed.command === "link") {
      botState(ctx).linkApiKeyOrToken = undefined
      await ctx.scene.enter("link_api_wizard")
      return
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
    console.log("[telegram/webhook] Received update:", body?.update_id)
    console.log("[telegram/webhook] Update body:", JSON.stringify(body, null, 2))
    await bot.handleUpdate(body)
    console.log("[telegram/webhook] bot.handleUpdate completed")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[telegram/webhook] Error handling update:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
