import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { searchStocks } from "@/lib/external/eulerpool"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const q = searchParams.get("q") ?? ""

    if (q.trim().length < 2) {
      return NextResponse.json([])
    }

    const results = await searchStocks(q)
    return NextResponse.json(results)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
