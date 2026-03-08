import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseArgs } from "@/lib/telegram/command-parser"
import { bot } from "@/lib/telegram/bot"

export async function handleStockImg(
  householdId: string,
  text: string,
  fileId?: string,
): Promise<string> {
  const args = parseArgs(text)

  if (args.length === 0) {
    return "❌ Usage: /stockimg <symbol> (attach an image)"
  }

  const symbol = args[args.length - 1].toUpperCase()

  if (!fileId) {
    return "📸 Please attach an image with this command."
  }

  const fileLink = await bot.telegram.getFileLink(fileId)
  const fileUrl = fileLink.href

  const supabase = createSupabaseAdmin()

  const { data: tx, error: fetchError } = await supabase
    .from("investment_transactions")
    .select("id")
    .eq("household_id", householdId)
    .eq("symbol", symbol)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (fetchError || !tx) {
    return `❌ No transactions found for ${symbol}.`
  }

  const { error: updateError } = await supabase
    .from("investment_transactions")
    .update({ screenshot_url: fileUrl })
    .eq("id", tx.id)

  if (updateError) return `❌ Update error: ${updateError.message}`

  return `📸 Screenshot saved for ${symbol}.`
}
