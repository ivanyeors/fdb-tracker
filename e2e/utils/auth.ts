import type { APIRequestContext, Page } from "@playwright/test"

export const FIXTURES = {
  H1: {
    householdId: "11111111-1111-4111-8111-111111111111",
    familyId: "22222222-2222-4222-8222-222222222222",
    profileAId: "33333333-3333-4333-8333-333333333333",
    profileBId: "44444444-4444-4444-8444-444444444444",
  },
  H2: {
    householdId: "55555555-5555-4555-8555-555555555555",
  },
  H3: {
    householdId: "77777777-7777-4777-8777-777777777777",
  },
} as const

interface LoginParams {
  householdId: string
  familyId?: string
  profileId?: string
  onboardingComplete?: boolean
}

/**
 * Mint a session for a specific household via /api/test/login.
 *
 * Use within a test that needs a different identity than the default storageState.
 * After calling, navigate to a page so the cookies take effect.
 */
export async function loginAs(
  request: APIRequestContext,
  params: LoginParams
): Promise<void> {
  const response = await request.post("/api/test/login", {
    data: {
      householdId: params.householdId,
      onboardingComplete: params.onboardingComplete ?? true,
      ...(params.familyId ? { familyId: params.familyId } : {}),
      ...(params.profileId ? { profileId: params.profileId } : {}),
    },
  })
  if (!response.ok()) {
    throw new Error(`loginAs failed: ${response.status()} ${await response.text()}`)
  }
}

/**
 * Switch the active profile by setting the cookie + localStorage values that
 * `hooks/use-active-profile.tsx` reads. Call after `page.goto()` so window exists.
 */
export async function setActiveProfile(
  page: Page,
  profileId: string | null
): Promise<void> {
  await page.evaluate((id) => {
    if (id) {
      localStorage.setItem("fdb-active-profile-id", id)
      document.cookie = `fdb-active-profile-id=${id}; path=/; max-age=31536000; SameSite=Lax`
    } else {
      localStorage.removeItem("fdb-active-profile-id")
      document.cookie =
        "fdb-active-profile-id=; path=/; max-age=0; SameSite=Lax"
    }
  }, profileId)
}
