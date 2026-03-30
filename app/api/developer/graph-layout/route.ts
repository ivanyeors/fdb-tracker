import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const saveSchema = z.object({
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .optional(),
})

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from("developer_graph_layouts")
      .select("positions, viewport, updated_at")
      .eq("household_id", session.accountId)
      .eq("graph_key", "calculation-network")
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ layout: data })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAdmin()
    const { error } = await supabase.from("developer_graph_layouts").upsert(
      {
        household_id: session.accountId,
        graph_key: "calculation-network",
        positions: parsed.data.positions,
        viewport: parsed.data.viewport ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,graph_key" }
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
