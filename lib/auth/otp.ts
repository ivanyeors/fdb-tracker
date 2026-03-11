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
  console.log("[otp] generateAndStoreOtp called with householdId:", householdId)
  
  try {
    const supabase = createSupabaseAdmin()
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const { count, error: countError } = await supabase
      .from("otp_tokens")
      .select("*", { count: "exact", head: true })
      .eq("household_id", householdId)
      .gte("created_at", fifteenMinAgo)

    if (countError) {
      console.error("[otp] Error counting OTP tokens:", countError)
    }

    console.log("[otp] Recent OTP count:", count)
    if (count !== null && count >= 3) {
      return { error: "Too many OTP requests. Please wait before trying again." }
    }

    const otp = Math.floor(100_000 + Math.random() * 900_000).toString()
    console.log("[otp] Generated OTP (first 2 digits):", otp.substring(0, 2) + "****")
    
    const otpHash = await sha256(otp)
    console.log("[otp] OTP hash created")

    const { error: insertError } = await supabase
      .from("otp_tokens")
      .insert({
        household_id: householdId,
        otp_hash: otpHash,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })

    if (insertError) {
      console.error("[otp] Error inserting OTP token:", insertError)
      console.error("[otp] Insert error details:", JSON.stringify(insertError, null, 2))
      return { error: "Failed to create OTP" }
    }

    console.log("[otp] OTP stored successfully")
    return { otp }
  } catch (err) {
    console.error("[otp] Unexpected error:", err)
    console.error("[otp] Error stack:", err instanceof Error ? err.stack : 'No stack trace')
    return { error: "Unexpected error generating OTP" }
  }
}
