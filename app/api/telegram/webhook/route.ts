import { NextRequest, NextResponse } from "next/server"

import { bot } from "@/lib/telegram/bot"
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
  const parsed = { command: match[1], rest: match[3] ?? "" }
  // #region agent log
  if (parsed.command === "otp") fetch('http://127.0.0.1:7309/ingest/0d1164bc-d634-4f03-bc72-c7b68f52ae42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f347fe'},body:JSON.stringify({sessionId:'f347fe',location:'webhook/route.ts:extractCommand',message:'Parsed /otp command',data:{command:parsed.command},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return parsed
}

async function handleOtpCommand(
  chatId: number,
  reply: (text: string) => Promise<unknown>,
): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7309/ingest/0d1164bc-d634-4f03-bc72-c7b68f52ae42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f347fe'},body:JSON.stringify({sessionId:'f347fe',location:'webhook/route.ts:handleOtpCommand',message:'handleOtpCommand entered',data:{chatId},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  try {
    const householdId = await getOrCreateHouseholdForChannel(String(chatId))
    // #region agent log
    fetch('http://127.0.0.1:7309/ingest/0d1164bc-d634-4f03-bc72-c7b68f52ae42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f347fe'},body:JSON.stringify({sessionId:'f347fe',location:'webhook/route.ts:handleOtpCommand',message:'getOrCreateHouseholdForChannel result',data:{householdId:householdId??'null'},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (!householdId) {
      await reply("❌ Failed to generate OTP. Please try again.")
      return
    }
    const result = await generateAndStoreOtp(householdId)
    // #region agent log
    fetch('http://127.0.0.1:7309/ingest/0d1164bc-d634-4f03-bc72-c7b68f52ae42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f347fe'},body:JSON.stringify({sessionId:'f347fe',location:'webhook/route.ts:handleOtpCommand',message:'generateAndStoreOtp result',data:{hasError:'error' in result,error:('error' in result?result.error:null),hasOtp:'otp' in result},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if ("error" in result) {
      await reply(`❌ ${result.error}`)
      return
    }
    await reply(`🔑 Your OTP: ${result.otp}`)
    // #region agent log
    fetch('http://127.0.0.1:7309/ingest/0d1164bc-d634-4f03-bc72-c7b68f52ae42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f347fe'},body:JSON.stringify({sessionId:'f347fe',location:'webhook/route.ts:handleOtpCommand',message:'OTP reply sent successfully',data:{},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
    // #endregion
  } catch (err) {
    console.error("[telegram/webhook] OTP error:", err)
    // #region agent log
    fetch('http://127.0.0.1:7309/ingest/0d1164bc-d634-4f03-bc72-c7b68f52ae42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f347fe'},body:JSON.stringify({sessionId:'f347fe',location:'webhook/route.ts:handleOtpCommand',message:'handleOtpCommand threw',data:{errMsg:err instanceof Error?err.message:String(err)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    await reply("❌ Something went wrong. Check server logs.")
  }
}

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
    await handleOtpCommand(chatId, (text) => ctx.reply(text))
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
    await handleOtpCommand(ctx.chat.id, (text) => ctx.reply(text))
  }
})

export async function POST(request: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("[telegram/webhook] TELEGRAM_BOT_TOKEN is not set")
    return NextResponse.json(
      { error: "Telegram bot not configured" },
      { status: 503 },
    )
  }

  try {
    const body = await request.json()
    console.log("[telegram/webhook] Received update:", body?.update_id)
    // #region agent log
    fetch('http://127.0.0.1:7309/ingest/0d1164bc-d634-4f03-bc72-c7b68f52ae42',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f347fe'},body:JSON.stringify({sessionId:'f347fe',location:'webhook/route.ts:POST',message:'Webhook received update',data:{updateId:body?.update_id,hasMessage:!!body?.message,hasChannelPost:!!body?.channel_post,messageText:body?.message?.text??body?.channel_post?.text},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
