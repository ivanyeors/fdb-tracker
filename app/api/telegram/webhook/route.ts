import { NextRequest, NextResponse } from "next/server"

import { getBot } from "@/lib/telegram/bot"
import { createSupabaseAdmin } from "@/lib/supabase/server"
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

async function getOrCreateAccount(chatId: string): Promise<string | null> {
  try {
    const supabase = createSupabaseAdmin()

    const { data: existing, error: lookupError } = await supabase
      .from("households")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle()

    if (lookupError) {
      console.error("[telegram] Account lookup failed:", lookupError.message)
      return null
    }

    if (existing?.id) return existing.id

    const { data: created, error: createError } = await supabase
      .from("households")
      .insert({ user_count: 1, telegram_chat_id: chatId })
      .select("id")
      .single()

    if (createError) {
      console.error("[telegram] Account creation failed:", createError.message)
      return null
    }

    return created?.id ?? null
  } catch (err) {
    console.error("[telegram] getOrCreateAccount error:", err)
    return null
  }
}

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
      "Use /link <token> to link your profile.\n" +
      "Type / to see all available commands.",
  )
}

async function handleLinkCommand(
  chatId: string,
  fromUserId: number | null,
  token: string,
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  if (!token) {
    await reply("❌ Please provide the token: /link <your-token>")
    return
  }

  const supabase = createSupabaseAdmin()
  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("telegram_link_token", token)
    .maybeSingle()

  if (lookupError || !profile) {
    await reply("❌ Invalid or expired link token.")
    return
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ 
      telegram_chat_id: String(chatId), 
      telegram_user_id: String(fromUserId ?? chatId),
      telegram_last_used: new Date().toISOString() 
    })
    .eq("id", profile.id)

  if (updateError) {
    await reply("❌ Failed to link account. Please try again.")
    return
  }

  await reply(`✅ Successfully linked your Telegram to profile: ${profile.name}`)
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
    const accountId = await getOrCreateAccount(String(chat.id))
    if (!accountId) {
      console.error("[telegram/otp] Account resolution failed for chatId:", chat.id)
      await reply("❌ Login is temporarily unavailable. Please try again shortly.")
      return
    }

    console.log("[telegram/otp] Account resolved:", JSON.stringify({ chatId: chat.id, accountId }))

    const result = await generateAndStoreOtp(accountId)
    console.log("[telegram/otp] generateAndStoreOtp result:", JSON.stringify(result))
    if (!result.ok) {
      console.error("[telegram/otp] OTP creation failed:", JSON.stringify(result))
      await reply(`❌ ${result.error}`)
      return
    }

    console.log("[telegram/otp] Sending OTP reply to chatId:", chat.id)
    await reply(`${result.otp}`)
    console.log("[telegram/otp] OTP reply sent successfully")
  } catch (err) {
    console.error("[telegram/otp] OTP error:", err)
    try {
      await reply("❌ Something went wrong. Check server logs.")
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

    if (parsed.command === "otp") {
      await handleOtpCommand(msg.chat, msg.from?.id ?? null, (text) =>
        bot.telegram.sendMessage(chatId, text),
      )
      return
    }

    if (parsed.command === "link") {
      await handleLinkCommand(String(chatId), msg.from?.id ?? null, parsed.rest.trim(), (text) => 
        bot.telegram.sendMessage(chatId, text)
      )
      return
    }

    const accountId = await getOrCreateAccount(String(chatId))
    if (!accountId) {
      await ctx.reply("❌ Could not resolve your account. Try /otp first to set up.")
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
      await handleOtpCommand(ctx.chat, null, (text) =>
        bot.telegram.sendMessage(ctx.chat.id, text),
      )
      return
    }

    if (parsed.command === "link") {
      await handleLinkCommand(String(ctx.chat.id), null, parsed.rest.trim(), (text) => 
        bot.telegram.sendMessage(ctx.chat.id, text)
      )
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
