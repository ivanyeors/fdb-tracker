import { test, expect } from "../utils/test"

// Sentinel = a heading text rendered after the page's primary client component
// finishes mounting. Waiting on this is deterministic; networkidle is not under
// Next.js App Router RSC streaming + ongoing background fetches.
const TOP_LEVEL_PAGES: ReadonlyArray<{ path: string; sentinel: string }> = [
  { path: "/dashboard", sentinel: "Overview" },
  { path: "/dashboard/banks", sentinel: "Banks" },
  { path: "/dashboard/cashflow", sentinel: "Cashflow" },
  { path: "/dashboard/cpf", sentinel: "CPF" },
  { path: "/dashboard/investments", sentinel: "Investments Detail" },
  { path: "/dashboard/loans", sentinel: "Loans" },
  { path: "/dashboard/insurance", sentinel: "Insurance" },
  { path: "/dashboard/tax", sentinel: "Tax Planner" },
  { path: "/settings", sentinel: "General Settings" },
]

test.describe("@smoke dashboard loads", () => {
  for (const { path, sentinel } of TOP_LEVEL_PAGES) {
    test(`${path} renders without console errors or 5xx`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" })
      expect(response, `no response for ${path}`).not.toBeNull()
      expect(response!.status()).toBeLessThan(400)

      await expect(
        page.getByRole("heading", { name: sentinel }).first()
      ).toBeVisible()

      // Console-error / 5xx invariant runs automatically via the pageErrors
      // auto-fixture in e2e/utils/test.ts — no manual assertion needed.
    })
  }
})
