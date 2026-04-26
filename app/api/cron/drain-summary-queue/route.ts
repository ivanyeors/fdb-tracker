import { NextRequest, NextResponse } from "next/server"
import { drainSummaryRefreshQueue } from "@/lib/repos/summary-refresh-queue"
import { createSupabaseAdmin } from "@/lib/supabase/server"

/**
 * Sweep summary_refresh_queue every 5 minutes (vercel.json). Inline drains
 * after each write usually clear pending rows immediately; this catches
 * anything left behind by a crashed request, network blip, or transient
 * Supabase error. Stale claims (>5 min) are reset before draining so a
 * crashed mid-flight drainer doesn't strand work.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdmin()
  const result = await drainSummaryRefreshQueue(supabase, { limit: 200 })

  console.log("[cron/drain-summary-queue]", result)
  return NextResponse.json({ ok: true, ...result })
}
