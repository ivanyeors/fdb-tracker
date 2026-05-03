import { test, expect } from "../utils/test"
import { FIXTURES, loginAs } from "../utils/auth"

test.describe("@critical onboarding", () => {
  test("skip endpoint completes onboarding and lands on /dashboard", async ({
    page,
    context,
  }) => {
    // Replace the default H1 (already onboarded) session with a fresh H2 session.
    await context.clearCookies()
    await loginAs(page.request, {
      householdId: FIXTURES.H2.householdId,
      onboardingComplete: false,
    })

    // Visiting /onboarding while not yet onboarded should show the welcome page.
    const initial = await page.goto("/onboarding")
    expect(initial?.status() ?? 0).toBeLessThan(400)

    // POST /api/onboarding/skip — server marks onboarding complete and reissues JWT.
    const skipRes = await page.request.post("/api/onboarding/skip", {
      data: {},
    })
    expect(
      skipRes.ok(),
      `skip failed: ${skipRes.status()} ${await skipRes.text()}`
    ).toBe(true)

    // After skip, /dashboard should be reachable (middleware no longer redirects to onboarding).
    const dashRes = await page.goto("/dashboard")
    expect(dashRes?.status() ?? 0).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard(\?|$)/)
  })
})
