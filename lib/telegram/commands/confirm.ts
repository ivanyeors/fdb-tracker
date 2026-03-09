import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"

export async function handleConfirm(
  householdId: string,
): Promise<string> {
  const supabase = createSupabaseAdmin()

  const { data: upload, error: fetchError } = await supabase
    .from("ocr_uploads")
    .select("id, parsed_data, profile_id, month")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (fetchError || !upload) {
    return "❌ No pending statement to confirm."
  }

  const parsedData = upload.parsed_data as Record<string, Json> | null
  
  if (!parsedData || !parsedData.totalCredits || !parsedData.totalDebits) {
    return "❌ No OCR data available. The OCR feature has been removed. Please enter cash flow data manually on the dashboard."
  }
  
  const inflow = Number(parsedData.totalCredits ?? 0)
  const outflow = Number(parsedData.totalDebits ?? 0)
  const month = upload.month ?? format(startOfMonth(new Date()), "yyyy-MM-dd")
  const monthLabel = format(new Date(month), "MMMM yyyy")

  if (upload.profile_id) {
    const { error: upsertError } = await supabase
      .from("monthly_cashflow")
      .upsert(
        {
          profile_id: upload.profile_id,
          month,
          inflow,
          outflow,
          source: "ocr",
        },
        { onConflict: "profile_id,month" },
      )

    if (upsertError) return `❌ Database error: ${upsertError.message}`
  }

  const { error: updateError } = await supabase
    .from("ocr_uploads")
    .update({ status: "confirmed" })
    .eq("id", upload.id)

  if (updateError) return `❌ Update error: ${updateError.message}`

  return `✅ Statement confirmed. Inflow: $${inflow}, Outflow: $${outflow} for ${monthLabel}.`
}
