import { SignJWT, jwtVerify } from "jose"

const COOKIE_NAME = "fdb-session"

/** Hard cap on session lifetime, measured from the original OTP login. */
export const ABSOLUTE_SESSION_MAX_AGE_DAYS = 21
/** Refresh threshold — only re-issue when the current token is older than this. */
const REFRESH_AFTER_SECONDS = 24 * 60 * 60
/** Length of each refreshed window (also the natural JWT expiry). */
export const SESSION_WINDOW_SECONDS = 7 * 24 * 60 * 60

function getSecret() {
  const raw = process.env.JWT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!raw) throw new Error("Missing JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY")
  return new TextEncoder().encode(raw)
}

export async function createSession(
  accountId: string,
  claims?: {
    onboardingComplete?: boolean
    originalIat?: number
    isSuperAdmin?: boolean
  }
): Promise<string> {
  const builder = new SignJWT({
    householdId: accountId,
    ...(claims?.onboardingComplete ? { obc: true } : {}),
    ...(claims?.originalIat ? { oiat: claims.originalIat } : {}),
    ...(claims?.isSuperAdmin ? { sa: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")

  return builder.sign(getSecret())
}

export interface SessionPayload {
  accountId: string
  onboardingComplete: boolean
  isSuperAdmin: boolean
  iat: number
  originalIat: number
}

export async function validateSession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const accountId = payload.householdId
    const iat = payload.iat
    if (typeof accountId !== "string" || typeof iat !== "number") return null
    const originalIat =
      typeof payload.oiat === "number" ? payload.oiat : iat
    return {
      accountId,
      onboardingComplete: payload.obc === true,
      isSuperAdmin: payload.sa === true,
      iat,
      originalIat,
    }
  } catch {
    return null
  }
}

/**
 * Returns true when the session is older than {@link REFRESH_AFTER_SECONDS}
 * AND is still inside the {@link ABSOLUTE_SESSION_MAX_AGE_DAYS} cap from the
 * original OTP login. Outside the cap, the session is allowed to expire
 * naturally so the user must re-OTP.
 */
export function shouldRefreshSession(
  iat: number,
  originalIat: number,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const ageOfCurrent = nowSeconds - iat
  const ageOfOriginal = nowSeconds - originalIat
  if (ageOfCurrent < REFRESH_AFTER_SECONDS) return false
  if (ageOfOriginal >= ABSOLUTE_SESSION_MAX_AGE_DAYS * 24 * 60 * 60)
    return false
  return true
}

/**
 * Validates `currentToken` and, if eligible, mints a fresh 7-day token while
 * preserving the original-issued-at timestamp. Returns `null` when the input
 * token is invalid or refresh is not allowed (caller should leave the cookie
 * alone in either case).
 */
export async function refreshSession(currentToken: string): Promise<string | null> {
  const session = await validateSession(currentToken)
  if (!session) return null
  if (!shouldRefreshSession(session.iat, session.originalIat)) return null
  return createSession(session.accountId, {
    onboardingComplete: session.onboardingComplete,
    originalIat: session.originalIat,
    isSuperAdmin: session.isSuperAdmin,
  })
}

interface CookieStore {
  get(name: string): { value: string } | undefined
}

export async function getSessionFromCookies(
  cookies: CookieStore
): Promise<string | null> {
  const session = await getSessionDetails(cookies)
  return session?.accountId ?? null
}

export async function getSessionDetails(
  cookies: CookieStore
): Promise<SessionPayload | null> {
  const cookie = cookies.get(COOKIE_NAME)
  if (!cookie) return null
  return validateSession(cookie.value)
}

export { COOKIE_NAME }
