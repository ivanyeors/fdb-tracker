import { NextRequest, NextResponse } from "next/server"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null

  const { pathname } = request.nextUrl

  // Unauthenticated: redirect / to login (OTP) so users land on OTP right away
  if (pathname === "/") {
    if (!session) return NextResponse.redirect(new URL("/login", request.url))
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
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

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/settings/:path*", "/onboarding/:path*"],
}
