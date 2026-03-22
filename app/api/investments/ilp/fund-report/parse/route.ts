import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { parseIlpFundReportMhtml } from "@/lib/ilp-import/index"

export const maxDuration = 60

const MAX_BYTES = 12 * 1024 * 1024

/**
 * POST multipart/form-data with field "file" (.mhtml). Returns parsed snapshot JSON only (no DB write).
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ct = request.headers.get("content-type") ?? ""
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 },
      )
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 400 })
    }

    const raw = await file.text()
    const result = parseIlpFundReportMhtml(raw, { sourceFile: file.name })

    return NextResponse.json({
      suggestedMonth: result.suggestedMonth,
      latestNavNumeric: result.latestNavNumeric,
      snapshot: result.snapshot,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to parse fund report" }, { status: 500 })
  }
}
