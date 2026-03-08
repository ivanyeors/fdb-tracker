import { NextRequest, NextResponse } from "next/server"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null

  const { pathname } = request.nextUrl

  if (!session) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  const supabase = createSupabaseAdmin()

  const { data: household } = await supabase
    .from("households")
    .select("onboarding_completed_at")
    .eq("id", session.householdId)
    .single()

  const onboardingComplete = !!household?.onboarding_completed_at
  const isOnboarding = pathname.startsWith("/onboarding")

  if (!onboardingComplete && !isOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", request.url))
  }

  if (onboardingComplete && isOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/onboarding/:path*"],
}
