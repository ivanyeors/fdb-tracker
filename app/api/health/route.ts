import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/server"

/**
 * Health check endpoint to verify environment configuration
 * Call with: curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.com/api/health"
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const checks = {
    TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
    CRON_SECRET: !!process.env.CRON_SECRET,
  }

  // Test Supabase connection
  let supabaseConnection = false
  let supabaseError: string | null = null
  
  try {
    const supabase = createSupabaseAdmin()
    const { count, error } = await supabase
      .from("households")
      .select("*", { count: "exact", head: true })
    
    if (error) {
      supabaseError = error.message
    } else {
      supabaseConnection = true
    }
  } catch (err) {
    supabaseError = err instanceof Error ? err.message : "Unknown error"
  }

  return NextResponse.json({
    ok: Object.values(checks).every(v => v) && supabaseConnection,
    timestamp: new Date().toISOString(),
    environment: {
      ...checks,
      supabaseConnection,
      supabaseError,
    }
  })
}