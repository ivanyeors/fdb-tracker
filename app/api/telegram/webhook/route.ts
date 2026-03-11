import { NextRequest, NextResponse } from "next/server"

import { getBot } from "@/lib/telegram/bot"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getOrCreateHouseholdForTelegramUser } from "@/lib/auth/household"
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

function getTelegramDisplayName(user: {
  first_name?: string
  last_name?: string
  username?: string
}): string | undefined {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
  if (fullName) return fullName
  if (user.username) return `@${user.username}`
  return undefined
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
  chatId: number,
  telegramUser: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
  },
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  try {
    const household = await getOrCreateHouseholdForTelegramUser(
      String(telegramUser.id),
      getTelegramDisplayName(telegramUser),
    )

    if (!household.ok) {
      console.error(
        "[telegram/otp] Telegram user sign-in failed:",
        serializeFailure(household, {
          chatId,
          telegramUserId: telegramUser.id,
          username: telegramUser.username ?? null,
        }),
      )
      await reply("❌ Login is temporarily unavailable. Please try again shortly.")
      return
    }

    const result = await generateAndStoreOtp(household.householdId)
    if (!result.ok) {
      console.error(
        "[telegram/otp] OTP creation failed:",
        serializeFailure(result, {
          chatId,
          telegramUserId: telegramUser.id,
          householdId: household.householdId,
        }),
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
    if (!("text" in msg) || !msg.text) return

    const parsed = extractCommand(msg.text)
    if (!parsed) return

    const chatId = msg.chat.id

    if (parsed.command === "otp") {
      if (msg.chat.type !== "private") {
        await ctx.reply("🔒 Send /otp in a private chat with the bot.")
        return
      }

      await handleOtpCommand(chatId, msg.from, (text) =>
        bot.telegram.sendMessage(chatId, text),
      )
      return
    }

    if (msg.chat.type === "private") {
      await ctx.reply("🔒 Use /otp here to sign in. Finance commands only run in your household chat.")
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
    if (!("text" in post) || !post.text) return

    const parsed = extractCommand(post.text)
    if (!parsed) return

    if (parsed.command === "otp") {
      await bot.telegram.sendMessage(
        ctx.chat.id,
        "🔒 Send /otp in a private chat with the bot.",
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
