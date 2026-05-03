import type { APIRequestContext } from "@playwright/test"
import { resolve } from "node:path"

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

// Baked-once storage states produced by `e2e/auth.setup.ts`. Specs declare
// identity by `test.use({ storageState: STORAGE_STATE_<NAME> })` — no inline
// loginAs + page.evaluate boilerplate.
export const STORAGE_STATE_H1 = resolve("playwright/.auth/user.json")
export const STORAGE_STATE_H1_PROFILE_A = resolve(
  "playwright/.auth/user-h1-profileA.json"
)

interface LoginParams {
  householdId: string
  familyId?: string
  profileId?: string
  onboardingComplete?: boolean
}

/**
 * Mint a session for a specific household via /api/test/login.
 *
 * Use only for identities not covered by a baked storage state — onboarding
 * specs (H2, H3) need to drive the wizard from a fresh-cookie state and so
 * can't reuse a baked state. Specs that just need H1 / H1+profileA should
 * declare `test.use({ storageState })` instead.
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
