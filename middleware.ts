import { NextRequest, NextResponse } from "next/server"

import {
  COOKIE_NAME,
  SESSION_WINDOW_SECONDS,
  createSession,
  shouldRefreshSession,
  validateSession,
} from "@/lib/auth/session"

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/onboarding/:path*"],
}

export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (!cookie) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const session = await validateSession(cookie)
  if (!session) {
    const res = NextResponse.redirect(new URL("/login", request.url))
    res.cookies.delete(COOKIE_NAME)
    return res
  }

  if (!shouldRefreshSession(session.iat, session.originalIat)) {
    return NextResponse.next()
  }

  const fresh = await createSession(session.accountId, {
    onboardingComplete: session.onboardingComplete,
    originalIat: session.originalIat,
    isSuperAdmin: session.isSuperAdmin,
  })

  const res = NextResponse.next()
  res.cookies.set(COOKIE_NAME, fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_WINDOW_SECONDS,
  })
  return res
}
