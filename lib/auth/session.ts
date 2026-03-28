import { SignJWT, jwtVerify } from "jose"

const COOKIE_NAME = "fdb-session"

function getSecret() {
  const raw = process.env.JWT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!raw) throw new Error("Missing JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY")
  return new TextEncoder().encode(raw)
}

export async function createSession(
  accountId: string,
  claims?: { onboardingComplete?: boolean }
): Promise<string> {
  return new SignJWT({
    householdId: accountId,
    ...(claims?.onboardingComplete ? { obc: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret())
}

export async function validateSession(
  token: string
): Promise<{ accountId: string; onboardingComplete: boolean } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const accountId = payload.householdId
    if (typeof accountId !== "string") return null
    return { accountId, onboardingComplete: payload.obc === true }
  } catch {
    return null
  }
}

interface CookieStore {
  get(name: string): { value: string } | undefined
}

export async function getSessionFromCookies(
  cookies: CookieStore
): Promise<string | null> {
  const cookie = cookies.get(COOKIE_NAME)
  if (!cookie) return null
  const session = await validateSession(cookie.value)
  return session?.accountId ?? null
}

export { COOKIE_NAME }
