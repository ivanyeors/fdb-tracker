import { createSupabaseAdmin } from "@/lib/supabase/server"

type OtpStage = "config" | "create"

export type GenerateOtpResult =
  | {
      ok: true
      otp: string
    }
  | {
      ok: false
      stage: OtpStage
      error: string
      code?: string
    }

export const OTP_RATE_LIMIT_PER_HOUR = 5

export async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function generateAndStoreOtp(
  accountId: string,
): Promise<GenerateOtpResult> {
  let supabase: ReturnType<typeof createSupabaseAdmin>
  try {
    supabase = createSupabaseAdmin()
  } catch (error) {
    return {
      ok: false,
      stage: "config",
      error:
        error instanceof Error ? error.message : "Supabase admin client failed",
    }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount, error: countError } = await supabase
    .from("otp_tokens")
    .select("*", { count: "exact", head: true })
    .eq("household_id", accountId)
    .gte("created_at", oneHourAgo)

  if (countError) {
    return {
      ok: false,
      stage: "create",
      error: "Failed to check OTP rate limit",
      code: countError.code,
    }
  }

  if ((recentCount ?? 0) >= OTP_RATE_LIMIT_PER_HOUR) {
    return {
      ok: false,
      stage: "create",
      error:
        "Too many OTP requests in the last hour. Try again later or use an existing valid login.",
    }
  }

  const otp = Math.floor(100_000 + Math.random() * 900_000).toString()
  const otpHash = await sha256(otp)

  const { error: insertError } = await supabase
    .from("otp_tokens")
    .insert({
      household_id: accountId,
      otp_hash: otpHash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })

  if (insertError) {
    return {
      ok: false,
      stage: "create",
      error: "Failed to create OTP",
      code: insertError.code,
    }
  }

  return { ok: true, otp }
}
