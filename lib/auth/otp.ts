import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function generateAndStoreOtp(
  householdId: string,
): Promise<{ otp: string } | { error: string }> {
  const supabase = createSupabaseAdmin()
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from("otp_tokens")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId)
    .gte("created_at", fifteenMinAgo)

  if (count !== null && count >= 3) {
    return { error: "Too many OTP requests. Please wait before trying again." }
  }

  const otp = Math.floor(100_000 + Math.random() * 900_000).toString()
  const otpHash = await sha256(otp)

  const { error: insertError } = await supabase
    .from("otp_tokens")
    .insert({
      household_id: householdId,
      otp_hash: otpHash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })

  if (insertError) {
    return { error: "Failed to create OTP" }
  }

  return { otp }
}
