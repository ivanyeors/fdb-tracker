import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { getSgdPerUsd } from "@/lib/external/usd-sgd"

/** Live USD→SGD rate for client forms (brokerage cash in USD, stored as SGD). */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sgdPerUsd = await getSgdPerUsd()
    return NextResponse.json({ sgdPerUsd: sgdPerUsd ?? null })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
