import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/server"

/**
 * PII-focused short-window purge. Defense-in-depth even when ciphertext is
 * populated: an attacker who only ever has access to recent rows is bounded
 * by these windows.
 *
 * - telegram_commands: 30 days. raw_message + args may capture free-form
 *   user input (financial figures, account numbers, names).
 * - otp_tokens: 7 days. Currently the table only stores otp_hash + flags;
 *   the row-level expiry is 5 minutes. The 7-day floor catches any future
 *   ip_address writer (column exists but unused today) and provides a
 *   second safety net regardless of business-logic deletion paths.
 *
 * Long-term archival deletes (12 months) live in app/api/cron/cleanup.
 */

const TELEGRAM_COMMANDS_RETENTION_DAYS = 30
const OTP_TOKENS_RETENTION_DAYS = 7

function cutoff(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdmin()
  const results: Record<string, number> = {}

  const { count: telegramCmds, error: tgErr } = await supabase
    .from("telegram_commands")
    .delete({ count: "exact" })
    .lt("created_at", cutoff(TELEGRAM_COMMANDS_RETENTION_DAYS))
  if (tgErr) {
    console.error("[cron/purge] telegram_commands delete failed:", tgErr)
    return NextResponse.json(
      { error: "telegram_commands purge failed" },
      { status: 500 },
    )
  }
  results.telegram_commands = telegramCmds ?? 0

  const { count: otpTokens, error: otpErr } = await supabase
    .from("otp_tokens")
    .delete({ count: "exact" })
    .lt("created_at", cutoff(OTP_TOKENS_RETENTION_DAYS))
  if (otpErr) {
    console.error("[cron/purge] otp_tokens delete failed:", otpErr)
    return NextResponse.json(
      { error: "otp_tokens purge failed" },
      { status: 500 },
    )
  }
  results.otp_tokens = otpTokens ?? 0

  console.log("[cron/purge] PII purge complete:", results)

  return NextResponse.json({ ok: true, purged: results })
}
