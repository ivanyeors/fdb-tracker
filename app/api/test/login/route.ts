import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSession, COOKIE_NAME } from "@/lib/auth/session"

const bodySchema = z.object({
  householdId: z.string().uuid(),
  onboardingComplete: z.boolean().optional().default(true),
  isSuperAdmin: z.boolean().optional().default(false),
  familyId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
})

function notFound() {
  return new NextResponse(null, { status: 404 })
}

// Security model: this endpoint is only callable when both
//   1. process.env.E2E_TEST_MODE === "1"  (set only by the e2e build/CI workflow)
//   2. request header x-e2e-secret matches process.env.E2E_TEST_SECRET (random 32-byte hex)
// Vercel deployments do NOT set E2E_TEST_MODE, so this returns 404 in prod even though
// the route ships with the bundle. NODE_ENV is intentionally NOT checked — `next start`
// sets it to "production" even for local E2E runs, which would defeat the gate.
function isGated(req: NextRequest): boolean {
  if (process.env.E2E_TEST_MODE !== "1") return false
  const expected = process.env.E2E_TEST_SECRET
  if (!expected) return false
  const provided = req.headers.get("x-e2e-secret")
  if (!provided || provided !== expected) return false
  return true
}

export async function POST(request: NextRequest) {
  if (!isGated(request)) return notFound()

  let parsed
  try {
    parsed = bodySchema.safeParse(await request.json())
  } catch {
    return notFound()
  }
  if (!parsed.success) return notFound()

  const { householdId, onboardingComplete, isSuperAdmin, familyId, profileId } =
    parsed.data

  const sessionToken = await createSession(householdId, {
    onboardingComplete,
    isSuperAdmin,
  })

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  if (familyId) {
    response.cookies.set("fdb-active-family-id", familyId, {
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  if (profileId) {
    response.cookies.set("fdb-active-profile-id", profileId, {
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  return response
}

export async function GET(request: NextRequest) {
  if (!isGated(request)) return notFound()
  return NextResponse.json({ ok: true, ready: true })
}
