import { NextRequest, NextResponse } from "next/server"

import {
  COOKIE_NAME,
  SESSION_WINDOW_SECONDS,
  refreshSession,
  validateSession,
} from "@/lib/auth/session"

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null

  const { pathname } = request.nextUrl

  if (pathname === "/") {
    if (!session) return NextResponse.redirect(new URL("/login", request.url))
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  if (!session) {
    const res = NextResponse.redirect(new URL("/login", request.url))
    res.cookies.delete(COOKIE_NAME)
    return res
  }

  const onboardingComplete = session.onboardingComplete
  const isOnboarding = pathname.startsWith("/onboarding")
  const isOptionalFlow = pathname.startsWith("/onboarding/optional")
  const isAddFamilyMode =
    request.nextUrl.searchParams.get("mode") === "new-family"
  const isResumeMode = request.nextUrl.searchParams.get("mode") === "resume"

  if (!onboardingComplete && !isOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", request.url))
  }

  if (
    onboardingComplete &&
    isOnboarding &&
    !isAddFamilyMode &&
    !isOptionalFlow &&
    !isResumeMode
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  const res = NextResponse.next()
  const fresh = token ? await refreshSession(token) : null
  if (fresh) {
    res.cookies.set(COOKIE_NAME, fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_WINDOW_SECONDS,
    })
  }
  return res
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/settings/:path*", "/onboarding/:path*"],
}
