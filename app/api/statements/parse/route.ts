import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { parsePdf } from "@/lib/pdf-import/parse-pdf"
import { classifyDocument } from "@/lib/pdf-import/classify"
import { extractDocument } from "@/lib/pdf-import/extract"

export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file?.name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Please upload a PDF file" },
        { status: 400 },
      )
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { text, pageCount, pages } = await parsePdf(buffer)

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            "Could not extract text from this PDF. It may be a scanned document.",
        },
        { status: 400 },
      )
    }

    const classification = classifyDocument(text)
    const extracted = extractDocument(text, classification.type, pages)

    return NextResponse.json({
      classification: {
        type: classification.type,
        confidence: classification.confidence,
        matchedKeywords: classification.matchedKeywords,
      },
      extracted,
      pageCount,
    })
  } catch (err) {
    console.error("[statements/parse] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse PDF" },
      { status: 500 },
    )
  }
}
