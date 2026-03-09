import { createSupabaseAdmin } from "@/lib/supabase/server"
import { bot } from "@/lib/telegram/bot"

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

  return "📄 PDF bank statement received and stored. Please enter the cash flow data manually on the dashboard."
}
