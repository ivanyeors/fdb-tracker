import { test as setup, expect } from "@playwright/test"
import { FIXTURES, STORAGE_STATE_H1, STORAGE_STATE_H1_PROFILE_A } from "./utils/auth"

const SECRET = process.env.E2E_TEST_SECRET ?? ""

setup("authenticate as H1 (default)", async ({ request }) => {
  expect(SECRET, "E2E_TEST_SECRET must be set").not.toBe("")

  const response = await request.post("/api/test/login", {
    headers: { "x-e2e-secret": SECRET },
    data: {
      householdId: FIXTURES.H1.householdId,
      familyId: FIXTURES.H1.familyId,
      onboardingComplete: true,
    },
  })

  expect(response.ok(), `test login failed: ${response.status()}`).toBe(true)

  await request.storageState({ path: STORAGE_STATE_H1 })
})

setup("authenticate as H1 + profile A", async ({ context, page }) => {
  expect(SECRET, "E2E_TEST_SECRET must be set").not.toBe("")

  // context.request shares cookies with the browser context, so the JWT cookie
  // set by /api/test/login lands in the storage state we save below.
  const response = await context.request.post("/api/test/login", {
    headers: { "x-e2e-secret": SECRET },
    data: {
      householdId: FIXTURES.H1.householdId,
      familyId: FIXTURES.H1.familyId,
      profileId: FIXTURES.H1.profileAId,
      onboardingComplete: true,
    },
  })
  expect(response.ok(), `test login failed: ${response.status()}`).toBe(true)

  // Seed localStorage so hooks/use-active-profile.tsx reads profile A on mount.
  // Need to navigate first so an origin exists for storageState to capture.
  await page.goto("/")
  await page.evaluate(
    ({ profileId, familyId }) => {
      localStorage.setItem("fdb-active-profile-id", profileId)
      localStorage.setItem("fdb-active-family-id", familyId)
    },
    {
      profileId: FIXTURES.H1.profileAId,
      familyId: FIXTURES.H1.familyId,
    }
  )

  await context.storageState({ path: STORAGE_STATE_H1_PROFILE_A })
})
