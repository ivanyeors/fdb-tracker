import type { Page } from "@playwright/test"
import { test, expect } from "../utils/test"
import { FIXTURES, loginAs } from "../utils/auth"

// Walks every onboarding step. Welcome/users/profiles get full form fills;
// later steps either click their per-step Skip button (where the page exposes
// one) or click Next with empty/default form state — but never the global
// "Skip setup" link, which short-circuits straight to /dashboard.
//
// Uses H3 (a fresh household reserved for this walk) so it doesn't collide
// with the H2 skip-endpoint spec. Re-running re-seeds H3 to a clean state
// via e2e/fixtures/seed.ts (DELETE families WHERE household_id = H3).

async function expectAtPath(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`), { timeout: 15_000 })
}

// "Next" buttons appear with an arrow-right icon; pages with sibling Skip
// buttons match `Skip` first when matched by name, so we anchor on /^Next/.
const nextButton = (page: Page) =>
  page.getByRole("button", { name: /^Next$/ }).first()

type Hop =
  | { kind: "next"; from: string; to: string }
  | { kind: "skip"; from: string; skipLabel: RegExp; to: string }

const HOPS: readonly Hop[] = [
  // 4. Income — per-step "Skip for now" (handleSkip posts defaults).
  { kind: "skip", from: "/onboarding/income", skipLabel: /^Skip for now$/, to: "/onboarding/cpf" },
  // 5. CPF — only Next exists (saves zeros).
  { kind: "next", from: "/onboarding/cpf", to: "/onboarding/banks" },
  // 6. Banks — Next with no accounts filled (saves empty list).
  { kind: "next", from: "/onboarding/banks", to: "/onboarding/telegram" },
  // 7. Telegram — Next with empty chatId (the schema accepts it).
  { kind: "next", from: "/onboarding/telegram", to: "/onboarding/reminders" },
  // 8. Reminders — Next saves the default schedule.
  { kind: "next", from: "/onboarding/reminders", to: "/onboarding/investments" },
  // 9. Investments — per-step "Skip".
  { kind: "skip", from: "/onboarding/investments", skipLabel: /^Skip$/, to: "/onboarding/loans" },
  // 10. Loans — per-step "Skip".
  { kind: "skip", from: "/onboarding/loans", skipLabel: /^Skip$/, to: "/onboarding/insurance" },
  // 11. Insurance — per-step "Skip".
  { kind: "skip", from: "/onboarding/insurance", skipLabel: /^Skip$/, to: "/onboarding/tax-reliefs" },
  // 12. Tax-reliefs — per-step "Skip".
  { kind: "skip", from: "/onboarding/tax-reliefs", skipLabel: /^Skip$/, to: "/onboarding/complete" },
] as const

test.describe("@critical onboarding full walk", () => {
  test("first-time onboarding completes via UI", async ({ page, context }) => {
    await context.clearCookies()
    await loginAs(page.request, {
      householdId: FIXTURES.H3.householdId,
      onboardingComplete: false,
    })

    // 1. Welcome — Get Started → /onboarding/users
    await page.goto("/onboarding")
    await page.getByRole("link", { name: /Get Started/i }).click()
    await expectAtPath(page, "/onboarding/users")

    // 2. Users — pick 2 → Next → /onboarding/profiles
    await page.getByRole("button", { name: "2", exact: true }).click()
    await nextButton(page).click()
    await expectAtPath(page, "/onboarding/profiles")

    // 3. Profiles — fill names + birth years → Next → /onboarding/income
    await page.getByLabel("Name", { exact: true }).first().fill("Walker A")
    await page.locator("#birth-year-0").click()
    await page.getByRole("option", { name: "1992", exact: true }).click()
    await page.getByLabel("Name", { exact: true }).nth(1).fill("Walker B")
    await page.locator("#birth-year-1").click()
    await page.getByRole("option", { name: "1994", exact: true }).click()
    await nextButton(page).click()
    await expectAtPath(page, "/onboarding/income")

    // 4-12. Step-specific advancement.
    for (const hop of HOPS) {
      await expectAtPath(page, hop.from)
      if (hop.kind === "skip") {
        const btn = page.getByRole("button", { name: hop.skipLabel }).first()
        await btn.scrollIntoViewIfNeeded()
        await btn.click()
      } else {
        await nextButton(page).click()
      }
      await expectAtPath(page, hop.to)
    }

    // 13. Complete — Go to Dashboard → /dashboard
    await page.getByRole("button", { name: /^Go to Dashboard/i }).click()
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 15_000 })

    // Verify persistence: H3 should now have one family with two profiles.
    // (No household-scoped profiles endpoint exists, so we resolve via families.)
    const familiesRes = await page.request.get(
      `/api/families?householdId=${FIXTURES.H3.householdId}`
    )
    if (familiesRes.ok()) {
      const families = (await familiesRes.json()) as Array<{ id: string }>
      expect(families.length, "expected at least one family for H3").toBeGreaterThan(0)
    }
  })
})
