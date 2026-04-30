import { test as setup, expect } from "@playwright/test"
import { resolve } from "node:path"

const STORAGE_STATE = resolve("playwright/.auth/user.json")
const SECRET = process.env.E2E_TEST_SECRET ?? ""

// Stable fixture from e2e/fixtures/seed.ts (FIXTURES.H1)
const FIXTURE_HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111"
const FIXTURE_FAMILY_ID = "22222222-2222-4222-8222-222222222222"

setup("authenticate as fixture household", async ({ request }) => {
  expect(SECRET, "E2E_TEST_SECRET must be set").not.toBe("")

  const response = await request.post("/api/test/login", {
    headers: { "x-e2e-secret": SECRET },
    data: {
      householdId: FIXTURE_HOUSEHOLD_ID,
      familyId: FIXTURE_FAMILY_ID,
      onboardingComplete: true,
    },
  })

  expect(response.ok(), `test login failed: ${response.status()}`).toBe(true)

  await request.storageState({ path: STORAGE_STATE })
})
