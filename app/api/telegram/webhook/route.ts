import { NextRequest, NextResponse } from "next/server"

import { getBot } from "@/lib/telegram/bot"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getOrCreateHouseholdForChannel } from "@/lib/auth/household"
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

async function resolveHousehold(chatId: number) {
  const supabase = createSupabaseAdmin()
  const { data } = await supabase
    .from("households")
    .select("id")
    .eq("telegram_chat_id", String(chatId))
    .single()
  return data?.id ?? null
}

type CommandHandler = (householdId: string, text: string) => Promise<string>

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

function serializeFailure(
  failure: { stage: string; error: string; code?: string },
  context: Record<string, string | number | null>,
) {
  return JSON.stringify({
    ...context,
    stage: failure.stage,
    error: failure.error,
    code: failure.code ?? null,
  })
}

async function handleOtpCommand(
  chat: { id: number; type: string },
  fromUserId: number | null,
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  console.log(
    "[telegram/otp] handleOtpCommand called:",
    JSON.stringify({
      chatId: chat.id,
      chatType: chat.type,
      fromUserId,
    }),
  )
  try {
    const household = await getOrCreateHouseholdForChannel(String(chat.id))
    if (!household.ok) {
      console.error(
        "[telegram/otp] Household resolution failed:",
        serializeFailure(household, {
          chatId: chat.id,
          chatType: chat.type,
          fromUserId,
        }),
      )
      await reply("❌ Login is temporarily unavailable. Please try again shortly.")
      return
    }

    console.log(
      "[telegram/otp] Household resolved:",
      JSON.stringify({
        chatId: chat.id,
        householdId: household.householdId,
        source: household.source,
      }),
    )

    const result = await generateAndStoreOtp(household.householdId)
    console.log("[telegram/otp] generateAndStoreOtp result:", JSON.stringify(result))
    if (!result.ok) {
      console.error(
        "[telegram/otp] OTP creation failed:",
        serializeFailure(result, {
          chatId: chat.id,
          chatType: chat.type,
          householdId: household.householdId,
        }),
      )
      await reply(`❌ ${result.error}`)
      return
    }

    console.log("[telegram/otp] Sending OTP reply to chatId:", chat.id)
    await reply(`🔑 Your OTP: ${result.otp}`)
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

/**
 * Sets up Telegraf handlers on the real bot instance.
 * Called once per cold start (guarded by the module-level flag).
 *
 * The old code used a Proxy export (`bot`) which only had a `get` trap.
 * Telegraf's Composer.use() internally does `this.handler = compose(...)`,
 * a SET operation that went to the Proxy's empty {} target instead of the
 * real Telegraf instance — so all .on() registrations were silently lost.
 */
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

    if (parsed.command === "otp") {
      await handleOtpCommand(msg.chat, msg.from?.id ?? null, (text) =>
        bot.telegram.sendMessage(chatId, text),
      )
      return
    }

    const householdId = await resolveHousehold(chatId)
    if (!householdId) {
      await ctx.reply("❌ This chat is not linked to a household.")
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
      const reply = await handleStockImg(householdId, msg.text, fileId)
      await ctx.reply(reply)
      return
    }

    const handler = textCommands[parsed.command]
    if (handler) {
      const reply = await handler(householdId, msg.text)
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

    if (parsed.command === "otp") {
      await handleOtpCommand(ctx.chat, null, (text) =>
        bot.telegram.sendMessage(ctx.chat.id, text),
      )
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
