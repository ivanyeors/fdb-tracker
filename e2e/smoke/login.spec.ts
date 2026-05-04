import { test, expect } from "../utils/test"

test.describe("@smoke login", () => {
  test("test login endpoint mints a session and dashboard is reachable", async ({
    page,
  }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test("test login endpoint returns 404 without secret", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/test/login`, {
      headers: { "x-e2e-secret": "" },
      data: {
        householdId: "11111111-1111-4111-8111-111111111111",
        onboardingComplete: true,
      },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(404)
  })

  test("test login endpoint returns 404 with wrong secret", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/test/login`, {
      headers: { "x-e2e-secret": "obviously-wrong-secret-value" },
      data: {
        householdId: "11111111-1111-4111-8111-111111111111",
        onboardingComplete: true,
      },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(404)
  })
})
