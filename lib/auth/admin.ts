import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getSessionDetails, type SessionPayload } from "@/lib/auth/session"

export async function getSuperAdminSession(): Promise<SessionPayload | null> {
  const session = await getSessionDetails(await cookies())
  if (!session?.isSuperAdmin) return null
  return session
}

export async function requireSuperAdmin(): Promise<
  { session: SessionPayload } | { response: NextResponse }
> {
  const session = await getSessionDetails(await cookies())
  if (!session) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  if (!session.isSuperAdmin) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }
  return { session }
}
