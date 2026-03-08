import { createSupabaseAdmin } from "@/lib/supabase/server"
import { bot } from "@/lib/telegram/bot"
import { parseBankStatement } from "@/lib/ocr/mindee-client"

export async function handlePdfUpload(
  householdId: string,
  fileId: string,
  profiles: Array<{ id: string; name: string }>,
): Promise<string> {
  const fileLink = await bot.telegram.getFileLink(fileId)
  const fileUrl = fileLink.href

  const supabase = createSupabaseAdmin()

  const { data: upload, error: insertError } = await supabase
    .from("ocr_uploads")
    .insert({
      household_id: householdId,
      file_url: fileUrl,
      status: "pending",
      parsed_data: null,
    })
    .select("id")
    .single()

  if (insertError || !upload) {
    return `❌ Failed to store upload: ${insertError?.message ?? "unknown error"}`
  }

  if (profiles.length > 1) {
    const names = profiles.map((p) => p.name).join(", ")
    return `📄 PDF received. Who does this statement belong to? Reply with the name (${names}).`
  }

  const profileId = profiles[0].id

  await supabase
    .from("ocr_uploads")
    .update({ profile_id: profileId })
    .eq("id", upload.id)

  if (!process.env.MINDEE_API_KEY) {
    return "📄 PDF received but MINDEE_API_KEY is not configured. Statement stored for manual review."
  }

  try {
    const response = await fetch(fileUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const result = await parseBankStatement(buffer)

    if (!result) {
      return "📄 PDF received but parsing failed. Statement stored for manual review."
    }

    await supabase
      .from("ocr_uploads")
      .update({ parsed_data: JSON.parse(JSON.stringify(result)) })
      .eq("id", upload.id)

    return `📄 Statement parsed. Inflow: $${result.totalCredits}, Outflow: $${result.totalDebits}. /confirm to save or /edit on dashboard.`
  } catch {
    return "📄 PDF received but parsing encountered an error. Statement stored for manual review."
  }
}
