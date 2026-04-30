import { test, expect } from "@playwright/test"
import { trackPageErrors } from "../utils/helpers"

const TOP_LEVEL_PAGES = [
  "/dashboard",
  "/dashboard/banks",
  "/dashboard/cashflow",
  "/dashboard/cpf",
  "/dashboard/investments",
  "/dashboard/loans",
  "/dashboard/insurance",
  "/dashboard/tax",
  "/settings",
] as const

test.describe("@smoke dashboard loads", () => {
  for (const path of TOP_LEVEL_PAGES) {
    test(`${path} renders without console errors or 5xx`, async ({ page }) => {
      const errors = trackPageErrors(page)

      const response = await page.goto(path)
      expect(response, `no response for ${path}`).not.toBeNull()
      expect(response!.status()).toBeLessThan(400)

      // Wait for the network to be idle so async data fetches complete.
      await page.waitForLoadState("networkidle")

      expect(
        errors.all(),
        `${path} produced errors: ${errors.all().join(" | ")}`
      ).toEqual([])
    })
  }
})
