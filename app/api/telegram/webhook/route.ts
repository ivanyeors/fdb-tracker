import { NextRequest, NextResponse } from "next/server"

import { bot } from "@/lib/telegram/bot"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { handleInflow } from "@/lib/telegram/commands/inflow"
import { handleOutflow } from "@/lib/telegram/commands/outflow"
import { handleBuy } from "@/lib/telegram/commands/buy"
import { handleSell } from "@/lib/telegram/commands/sell"
import { handleStockImg } from "@/lib/telegram/commands/stockimg"
import { handleIlp } from "@/lib/telegram/commands/ilp"
import { handleGoaladd } from "@/lib/telegram/commands/goaladd"
import { handleRepay } from "@/lib/telegram/commands/repay"
import { handleEarlyrepay } from "@/lib/telegram/commands/earlyrepay"
import { handleConfirm } from "@/lib/telegram/commands/confirm"
import { handlePdfUpload } from "@/lib/telegram/commands/pdf-handler"

async function resolveHousehold(chatId: number) {
  const supabase = createSupabaseAdmin()
  const { data } = await supabase
    .from("households")
    .select("id")
    .eq("telegram_chat_id", String(chatId))
    .single()
  return data?.id ?? null
}

async function resolveProfiles(householdId: string) {
  const supabase = createSupabaseAdmin()
  const { data } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("household_id", householdId)
  return data ?? []
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

bot.on("message", async (ctx) => {
  const msg = ctx.message

  if ("document" in msg && msg.document?.mime_type === "application/pdf") {
    const chatId = msg.chat.id
    const householdId = await resolveHousehold(chatId)
    if (!householdId) {
      await ctx.reply("❌ This chat is not linked to a household.")
      return
    }
    const profiles = await resolveProfiles(householdId)
    const reply = await handlePdfUpload(householdId, msg.document.file_id, profiles)
    await ctx.reply(reply)
    return
  }

  if (!("text" in msg) || !msg.text) return

  const parsed = extractCommand(msg.text)
  if (!parsed) return

  const chatId = msg.chat.id
  const householdId = await resolveHousehold(chatId)
  if (!householdId) {
    await ctx.reply("❌ This chat is not linked to a household.")
    return
  }

  if (parsed.command === "confirm") {
    const reply = await handleConfirm(householdId)
    await ctx.reply(reply)
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

export async function POST(request: NextRequest) {
  const body = await request.json()
  await bot.handleUpdate(body)
  return NextResponse.json({ ok: true })
}
