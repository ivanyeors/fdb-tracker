import { Scenes } from "telegraf"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext, getBot } from "@/lib/telegram/bot"
import { progressHeader, errorMsg } from "@/lib/telegram/scene-helpers"

const TOTAL_STEPS = 2 // symbol, image

export const stockImgScene = new Scenes.WizardScene<MyContext>(
  "stockimg_wizard",
  async (ctx) => {
    // Step 1: Initialize, check for pre-filled args, prompt for symbol
    const st = botState(ctx)
    const accountId = st.accountId as string
    const prefilledSymbol = st.symbol
    const prefilledFileId = st.fileId

    if (!accountId) {
      await ctx.reply("❌ Session error: Missing account ID.")
      return ctx.scene.leave()
    }

    ctx.scene.session.fileId = prefilledFileId

    if (prefilledSymbol) {
      ctx.scene.session.symbol = prefilledSymbol

      if (prefilledFileId) {
        return handleImageUpload(ctx, prefilledFileId)
      }

      const header = progressHeader(
        2,
        TOTAL_STEPS,
        `Attaching screenshot for ${prefilledSymbol}`,
      )
      await ctx.reply(
        `${header}\n\nGot symbol: ${prefilledSymbol}.\nPlease upload or forward the screenshot image.`,
      )
      return ctx.wizard.next()
    }

    const supabase = createSupabaseAdmin()
    const { data: households } = await supabase
      .from("households")
      .select(`families ( id )`)
      .eq("id", accountId)
      .single()

    const familyIds = households?.families?.map((f) => f.id) || []

    if (familyIds.length === 0) {
      await ctx.reply("❌ No families found for this account.")
      return ctx.scene.leave()
    }

    const { data: recentTxs } = await supabase
      .from("investment_transactions")
      .select("symbol")
      .in("family_id", familyIds)
      .order("created_at", { ascending: false })
      .limit(20)

    const uniqueSymbols = Array.from(
      new Set(recentTxs?.map((tx) => tx.symbol) || []),
    ).slice(0, 5)

    const header = progressHeader(1, TOTAL_STEPS, "Attaching stock screenshot")

    if (uniqueSymbols.length > 0) {
      const buttons = uniqueSymbols.map((sym) => [
        { text: sym, callback_data: `sym_${sym}` },
      ])
      await ctx.reply(
        `${header}\n\nType the stock symbol (e.g. AAPL) or select a recent one:`,
        { reply_markup: { inline_keyboard: buttons } },
      )
    } else {
      await ctx.reply(
        `${header}\n\nType the stock symbol for the screenshot (e.g. AAPL):`,
      )
    }

    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2: Handle Symbol selection -> Ask for Image
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("sym_")) {
        ctx.scene.session.symbol = data.replace("sym_", "")
        await ctx.answerCbQuery()

        if (ctx.scene.session.fileId) {
          return handleImageUpload(ctx, ctx.scene.session.fileId)
        }

        const header = progressHeader(
          2,
          TOTAL_STEPS,
          `Attaching screenshot for ${ctx.scene.session.symbol}`,
        )
        await ctx.reply(
          `${header}\n\nSelected ${ctx.scene.session.symbol}. Please upload or forward the screenshot:`,
        )
        return ctx.wizard.next()
      }
    }

    if (ctx.message && "text" in ctx.message) {
      const symbol = ctx.message.text.toUpperCase().trim()
      if (!symbol || symbol.includes(" ")) {
        await ctx.reply(errorMsg("Invalid symbol. Enter a single ticker.", "AAPL"))
        return undefined
      }
      ctx.scene.session.symbol = symbol

      if (ctx.scene.session.fileId) {
        return handleImageUpload(ctx, ctx.scene.session.fileId)
      }

      const header = progressHeader(
        2,
        TOTAL_STEPS,
        `Attaching screenshot for ${symbol}`,
      )
      await ctx.reply(
        `${header}\n\nPlease upload or forward the screenshot image:`,
      )
      return ctx.wizard.next()
    }

    return undefined
  },
  async (ctx) => {
    // Step 3: Handle Image -> Execute DB
    let fileId: string | undefined
    if (
      ctx.message &&
      "photo" in ctx.message &&
      Array.isArray(ctx.message.photo) &&
      ctx.message.photo.length > 0
    ) {
      fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id
    }

    if (!fileId) {
      await ctx.reply(errorMsg("Please upload a valid image.", "Send or forward a photo"))
      return undefined
    }

    return handleImageUpload(ctx, fileId)
  },
)

async function handleImageUpload(ctx: MyContext, fileId: string) {
  const accountId = botState(ctx).accountId as string
  const preFamilyId = botState(ctx).familyId
  const symbol = ctx.scene.session.symbol!

  const bot = getBot()
  const fileLink = await bot.telegram.getFileLink(fileId)
  const fileUrl = fileLink.href

  const supabase = createSupabaseAdmin()

  let familyIds: string[] = []
  if (preFamilyId) {
    familyIds = [preFamilyId]
  } else {
    const { data: households } = await supabase
      .from("households")
      .select(`families ( id )`)
      .eq("id", accountId)
      .single()

    familyIds = households?.families?.map((f) => f.id) || []
  }

  const { data: tx, error: fetchError } = await supabase
    .from("investment_transactions")
    .select("id")
    .in("family_id", familyIds)
    .eq("symbol", symbol)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError || !tx) {
    await ctx.reply(`❌ No recent transactions found for ${symbol}.`)
    return ctx.scene.leave()
  }

  const { error: updateError } = await supabase
    .from("investment_transactions")
    .update({ screenshot_url: fileUrl })
    .eq("id", tx.id)

  if (updateError) {
    await ctx.reply(`❌ Update error: ${updateError.message}`)
    return ctx.scene.leave()
  }

  await ctx.reply(`📸 Screenshot successfully saved for ${symbol}.`)
  return ctx.scene.leave()
}
