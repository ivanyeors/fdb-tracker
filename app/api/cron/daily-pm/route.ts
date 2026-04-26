import { NextRequest, NextResponse } from "next/server"

/**
 * Vercel Hobby caps cron jobs at 2 (daily granularity). This endpoint is
 * one of those two — it fans out to the evening batch (housekeeping +
 * security purges) via internal HTTP with the same CRON_SECRET bearer.
 * Each sub-endpoint stays callable on its own for manual invocation.
 *
 * Pair: app/api/cron/daily-am/route.ts
 *
 * drain-summary-queue used to fire every 5 minutes; now daily. Inline
 * drains after each write clear pending rows in the common case, so the
 * daily sweep functions purely as a crash-recovery safety net.
 */
const SUB_PATHS = [
  "/api/cron/purge",
  "/api/cron/cleanup",
  "/api/cron/drain-summary-queue",
] as const

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL not set" },
      { status: 500 },
    )
  }

  const results: Record<
    string,
    { ok: boolean; status: number; body: unknown }
  > = {}

  await Promise.all(
    SUB_PATHS.map(async (path) => {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${cronSecret}` },
        })
        const body = await res.json().catch(() => null)
        results[path] = { ok: res.ok, status: res.status, body }
      } catch (err) {
        results[path] = {
          ok: false,
          status: 0,
          body: { error: err instanceof Error ? err.message : String(err) },
        }
      }
    }),
  )

  const allOk = Object.values(results).every((r) => r.ok)
  return NextResponse.json(
    { ok: allOk, results },
    { status: allOk ? 200 : 207 },
  )
}
