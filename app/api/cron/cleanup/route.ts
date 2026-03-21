import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/server"

/** Retention: keep snapshots and audit logs for the last 12 months. */
const RETENTION_MONTHS = 12

function cutoffDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - RETENTION_MONTHS)
  return d.toISOString()
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdmin()
  const cutoff = cutoffDate()
  const results: Record<string, number> = {}

  // Clean up old investment snapshots
  const { count: investmentSnaps } = await supabase
    .from("investment_snapshots")
    .delete({ count: "exact" })
    .lt("created_at", cutoff)
  results.investment_snapshots = investmentSnaps ?? 0

  // Clean up old net worth snapshots
  const { count: netWorthSnaps } = await supabase
    .from("net_worth_snapshots")
    .delete({ count: "exact" })
    .lt("created_at", cutoff)
  results.net_worth_snapshots = netWorthSnaps ?? 0

  // Clean up old bank balance snapshots
  const { count: bankSnaps } = await supabase
    .from("bank_balance_snapshots")
    .delete({ count: "exact" })
    .lt("created_at", cutoff)
  results.bank_balance_snapshots = bankSnaps ?? 0

  // Clean up old telegram command logs
  const { count: telegramCmds } = await supabase
    .from("telegram_commands")
    .delete({ count: "exact" })
    .lt("created_at", cutoff)
  results.telegram_commands = telegramCmds ?? 0

  console.log("[cron/cleanup] Pruned old records:", results)

  return NextResponse.json({ ok: true, pruned: results })
}
