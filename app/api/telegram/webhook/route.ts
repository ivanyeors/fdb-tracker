import { NextRequest, NextResponse } from "next/server"

import { Scenes, session } from "telegraf"

import { botState, getBot, MyContext } from "@/lib/telegram/bot"
import { cancelMiddleware } from "@/lib/telegram/scene-helpers"
import { generateAndStoreOtp } from "@/lib/auth/otp"
import {
  resolveHouseholdId,
  resolveOrProvisionPublicUser,
} from "@/lib/telegram/resolve-household"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { supabaseSessionStore } from "@/lib/telegram/session"
import {
  inflowScene,
  outflowScene,
} from "@/lib/telegram/scenes/cashflow-scene-factory"
import { buySellScene } from "@/lib/telegram/scenes/buy-sell-scene"
import { ilpScene } from "@/lib/telegram/scenes/ilp-scene"
import { goalAddScene } from "@/lib/telegram/scenes/goaladd-scene"
import { repayScene } from "@/lib/telegram/scenes/repay-scene"
import { stockImgScene } from "@/lib/telegram/scenes/stockimg-scene"
import { authScene } from "@/lib/telegram/scenes/auth-scene"
import { linkApiScene } from "@/lib/telegram/scenes/link-api-scene"
import { otpScene } from "@/lib/telegram/scenes/otp-scene"
import { pdfScene } from "@/lib/telegram/scenes/pdf-scene"
import { taxScene } from "@/lib/telegram/scenes/tax-scene"
import { signupScene } from "@/lib/telegram/scenes/signup-scene"
import { joinScene } from "@/lib/telegram/scenes/join-scene"

type CommandHandler = (accountId: string, text: string) => Promise<string>

const textCommands: Record<string, CommandHandler> = {}

function extractCommand(
  text: string
): { command: string; rest: string } | null {
  const match = text.match(/^\/(\w+)(@\S+)?\s*([\s\S]*)$/)
  if (!match) return null
  return { command: match[1], rest: match[3] ?? "" }
}

async function handleStartCommand(
  chatId: string,
  fromUserId: string | null,
  fromUsername: string | null,
  firstName: string | null,
  reply: (text: string) => Promise<unknown>
): Promise<void> {
  const ctx = await resolveOrProvisionPublicUser(
    chatId,
    fromUserId,
    fromUsername,
    firstName
  )
  if (!ctx) {
    await reply(
      "❌ Something went wrong setting up your account. Please try again."
    )
    return
  }

  if (ctx.accountType === "public") {
    await reply(
      "👋 Welcome to fdb-tracker!\n\n" +
        "Track your finances right here in Telegram:\n" +
        "  /in — Record monthly income\n" +
        "  /out — Record monthly expenses\n" +
        "  /buy — Record a stock purchase\n" +
        "  /sell — Record a stock sale\n" +
        "  /goaladd — Add to a savings goal\n" +
        "  /repay — Log a loan repayment\n\n" +
        "Type / to see all available commands.\n" +
        "Type /cancel at any time to exit a command."
    )
  } else {
    await reply(
      "👋 Welcome to fdb-tracker!\n\n" +
        "Use /otp to get a one-time password for logging in.\n" +
        "Use /link to link your profile — I'll guide you through it.\n" +
        "Use /auth to link your account with an API key from the platform.\n" +
        "Type / to see all available commands.\n" +
        "Type /cancel at any time to exit a command."
    )
  }
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
    JSON.stringify({
      chatId: chat.id,
      chatType: chat.type,
      fromUserId,
      telegramUsername,
    })
  )
  try {
    const accountId = await resolveHouseholdId(
      String(chat.id),
      fromUserId != null ? String(fromUserId) : null,
      { telegramUsername, allowCreate: false }
    )

    if (accountId) {
      console.log(
        "[telegram/otp] Account resolved:",
        JSON.stringify({ chatId: chat.id, accountId })
      )

      const result = await generateAndStoreOtp(accountId)
      console.log(
        "[telegram/otp] generateAndStoreOtp result:",
        JSON.stringify(result)
      )
      if (!result.ok) {
        console.error(
          "[telegram/otp] OTP creation failed:",
          JSON.stringify(result)
        )
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
    pdfScene,
    taxScene,
    signupScene,
    joinScene,
  ])

  bot.use(session({ store: supabaseSessionStore }))
  stage.use(cancelMiddleware)
  bot.use(stage.middleware())

  bot.catch((err) => {
    console.error("[telegram/webhook] Bot error:", err)
  })

  // Cross-prompt handlers: after /in completes, offer /out (and vice versa)
  bot.action(/^cross_(in|out)_(.+)_(\d{4}-\d{2}-\d{2})_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    const [, direction, profileId, month, profileName] = ctx.match
    const st = botState(ctx)
    st.profileId = profileId
    st.familyId = undefined
    const scene = direction === "in" ? "inflow_wizard" : "outflow_wizard"
    await ctx.scene.enter(scene)
    // Pre-fill profile and month so user skips to amount entry
    ctx.scene.session.profileId = profileId
    ctx.scene.session.profileName = profileName
    ctx.scene.session.month = month
    const d = new Date(month)
    ctx.scene.session.monthLabel = d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
    ctx.wizard.selectStep(3) // STEP_AMOUNT
    const { progressHeader } = await import("@/lib/telegram/scene-helpers")
    const label = direction === "in" ? "inflow" : "outflow"
    const header = progressHeader(3, 4, `Recording ${label} for ${profileName}`)
    await ctx.reply(
      `${header}\n\nMonth: ${ctx.scene.session.monthLabel}\n\nEnter the ${label} amount:`
    )
  })

  bot.action("cross_skip", async (ctx) => {
    await ctx.answerCbQuery()
    try {
      await ctx.editMessageReplyMarkup(undefined)
    } catch {
      // Message may already be edited or too old
    }
  })

  bot.on("message", async (ctx) => {
    const msg = ctx.message
    console.log(
      "[telegram/webhook] bot.on('message') triggered, chat.id:",
      msg.chat.id,
      "chat.type:",
      msg.chat.type
    )

    // Handle PDF document uploads
    if ("document" in msg && msg.document?.mime_type === "application/pdf") {
      console.log(
        "[telegram/webhook] PDF document received, entering pdf scene"
      )
      const userContext = await resolveOrProvisionPublicUser(
        String(msg.chat.id),
        msg.from?.id != null ? String(msg.from.id) : null,
        msg.from?.username ?? null,
        msg.from?.first_name ?? null
      )
      if (!userContext) {
        await ctx.reply(
          "❌ Could not resolve your account. Please try /start first."
        )
        return
      }
      const st = botState(ctx)
      st.accountId = userContext.householdId
      st.profileId = userContext.profileId ?? undefined
      st.familyId = userContext.familyId ?? undefined
      st.accountType = userContext.accountType
      await ctx.scene.enter("pdf_upload_wizard")
      return
    }

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
      const payload = parsed.rest.trim()

      // Deep link: /start signup_CODE
      if (payload.startsWith("signup_")) {
        botState(ctx).signupCode = payload.slice(7)
        await ctx.scene.enter("signup_wizard") // step 0 detects code and auto-processes
        return
      }

      // Deep link: /start join_CODE
      if (payload.startsWith("join_")) {
        botState(ctx).joinCode = payload.slice(5)
        await ctx.scene.enter("join_wizard") // step 0 detects code and auto-processes
        return
      }

      await handleStartCommand(
        String(chatId),
        msg.from?.id != null ? String(msg.from.id) : null,
        msg.from?.username ?? null,
        msg.from?.first_name ?? null,
        (text) => bot.telegram.sendMessage(chatId, text)
      )
      return
    }

    // Resolve user context (auto-provisions public accounts on first use)
    const userContext = await resolveOrProvisionPublicUser(
      String(chatId),
      msg.from?.id != null ? String(msg.from.id) : null,
      msg.from?.username ?? null,
      msg.from?.first_name ?? null
    )

    // /signup and /join are always available (not gated by account type)
    if (parsed.command === "signup") {
      await ctx.scene.enter("signup_wizard")
      return
    }

    if (parsed.command === "join") {
      await ctx.scene.enter("join_wizard")
      return
    }

    // Gate owner-only commands
    if (parsed.command === "auth") {
      if (userContext?.accountType === "public") {
        await ctx.reply(
          "This command is not available. Use /in, /out, /buy, /sell, /goaladd, or /repay to track your finances."
        )
        return
      }
      botState(ctx).linkApiKeyOrToken = undefined
      await ctx.scene.enter("auth_wizard")
      return
    }

    if (parsed.command === "link") {
      if (userContext?.accountType === "public") {
        await ctx.reply(
          "This command is not available. Use /in, /out, /buy, /sell, /goaladd, or /repay to track your finances."
        )
        return
      }
      botState(ctx).linkApiKeyOrToken = undefined
      await ctx.scene.enter("link_api_wizard")
      return
    }

    if (parsed.command === "otp") {
      if (userContext?.accountType === "public") {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
        await ctx.reply(
          "You have a Telegram-only account. To get web access:\n\n" +
            `• Sign up at ${appUrl}/login\n` +
            "• Or ask your household admin for an invite code and use /join"
        )
        return
      }
      await handleOtpCommand(ctx)
      return
    }

    if (!userContext) {
      await ctx.reply(
        "❌ Could not resolve your account. Please try /start first."
      )
      return
    }

    const accountId = userContext.householdId

    // Update telegram_last_used for linked profiles
    if (userContext.profileId) {
      createSupabaseAdmin()
        .from("profiles")
        .update({ telegram_last_used: new Date().toISOString() })
        .eq("id", userContext.profileId)
        .then(() => {})
    }

    function setBotContext() {
      const st = botState(ctx)
      st.accountId = accountId
      st.profileId = userContext!.profileId ?? undefined
      st.familyId = userContext!.familyId ?? undefined
      st.accountType = userContext!.accountType
    }

    if (parsed.command === "in") {
      setBotContext()
      botState(ctx).cashflowCommandRest = parsed.rest
      await ctx.scene.enter("inflow_wizard")
      return
    }

    if (parsed.command === "out") {
      setBotContext()
      botState(ctx).cashflowCommandRest = parsed.rest
      await ctx.scene.enter("outflow_wizard")
      return
    }

    if (parsed.command === "buy") {
      setBotContext()
      botState(ctx).type = "buy"
      await ctx.scene.enter("buy_sell_wizard")
      return
    }

    if (parsed.command === "sell") {
      setBotContext()
      botState(ctx).type = "sell"
      await ctx.scene.enter("buy_sell_wizard")
      return
    }

    if (parsed.command === "ilp") {
      setBotContext()
      await ctx.scene.enter("ilp_wizard")
      return
    }

    if (parsed.command === "goaladd") {
      setBotContext()
      await ctx.scene.enter("goaladd_wizard")
      return
    }

    if (parsed.command === "repay") {
      setBotContext()
      botState(ctx).isEarlyRepayment = false
      await ctx.scene.enter("repay_wizard")
      return
    }

    if (parsed.command === "earlyrepay") {
      setBotContext()
      botState(ctx).isEarlyRepayment = true
      await ctx.scene.enter("repay_wizard")
      return
    }

    if (parsed.command === "pdf") {
      setBotContext()
      await ctx.scene.enter("pdf_upload_wizard")
      return
    }

    if (parsed.command === "tax") {
      setBotContext()
      botState(ctx).rest = parsed.rest || undefined
      await ctx.scene.enter("tax_wizard")
      return
    }

    if (parsed.command === "stockimg") {
      let fileId: string | undefined
      if ("photo" in msg && Array.isArray(msg.photo) && msg.photo.length > 0) {
        fileId = (msg.photo[msg.photo.length - 1] as { file_id: string })
          .file_id
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

      setBotContext()
      const st = botState(ctx)
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
    console.log(
      "[telegram/webhook] bot.on('channel_post') triggered, chat.id:",
      ctx.chat.id
    )

    if (!("text" in post) || !post.text) return

    const parsed = extractCommand(post.text)
    if (!parsed) return

    console.log("[telegram/webhook] Channel post command:", parsed.command)

    if (parsed.command === "start") {
      await handleStartCommand(String(ctx.chat.id), null, null, null, (text) =>
        bot.telegram.sendMessage(ctx.chat.id, text)
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
      { status: 503 }
    )
  }

  // Verify webhook secret if configured
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) {
    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token")
    if (headerSecret !== webhookSecret) {
      console.warn("[telegram/webhook] Invalid or missing webhook secret")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const bot = getBot()
  ensureHandlers()

  try {
    const body = await request.json()
    console.log("[telegram/webhook] Received update:", body?.update_id)
    console.log(
      "[telegram/webhook] Update body:",
      JSON.stringify(body, null, 2)
    )
    await bot.handleUpdate(body)
    console.log("[telegram/webhook] bot.handleUpdate completed")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[telegram/webhook] Error handling update:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
