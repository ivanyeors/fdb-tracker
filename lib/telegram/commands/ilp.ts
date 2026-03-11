import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { parseIlpArgs } from "@/lib/telegram/command-parser"
import { resolveUser } from "@/lib/telegram/user-resolver"

export async function handleIlp(
  accountId: string,
  text: string,
): Promise<string> {
  const parsed = parseIlpArgs(text)
  if ("error" in parsed) return `❌ ${parsed.error}`

  const user = await resolveUser(parsed.name ?? "", accountId)
  if ("error" in user) return `❌ ${user.error}`

  const supabase = createSupabaseAdmin()

  const { data: product, error: prodError } = await supabase
    .from("ilp_products")
    .select("id, name")
    .eq("household_id", accountId)
    .ilike("name", parsed.product)
    .single()

  if (prodError || !product) {
    return `❌ ILP product '${parsed.product}' not found.`
  }

  const month = format(startOfMonth(new Date()), "yyyy-MM-dd")
  const monthLabel = format(new Date(), "MMMM yyyy")

  const { error } = await supabase.from("ilp_entries").upsert(
    {
      product_id: product.id,
      month,
      fund_value: parsed.value,
    },
    { onConflict: "product_id,month" },
  )

  if (error) return `❌ Database error: ${error.message}`

  return `✅ ${product.name} fund value set to $${parsed.value} for ${monthLabel}.`
}
