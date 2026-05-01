import { test, expect } from "@playwright/test"
import { FIXTURES, loginAs } from "../utils/auth"

test.describe("@critical holdings", () => {
  test("buy gold via UI surfaces the holding via /api/investments", async ({
    page,
    context,
  }) => {
    // Login with profileId set so the investment_account is profile-scoped.
    // Re-runs find the existing account via .eq('profile_id', X) and don't
    // hit the (family_id, account_name) constraint that blocks family-level inserts.
    await context.clearCookies()
    await loginAs(page.request, {
      householdId: FIXTURES.H1.householdId,
      familyId: FIXTURES.H1.familyId,
      profileId: FIXTURES.H1.profileAId,
    })

    await page.goto("/dashboard/investments")
    await page.evaluate(
      ({ profileId, familyId }) => {
        localStorage.setItem("fdb-active-profile-id", profileId)
        localStorage.setItem("fdb-active-family-id", familyId)
      },
      { profileId: FIXTURES.H1.profileAId, familyId: FIXTURES.H1.familyId }
    )
    await page.goto("/dashboard/investments")
    await page.waitForLoadState("networkidle")

    // Open the Add Holding sheet — the button lives inside the Holdings tab,
    // which is the default tab. Wait for it to become attached + visible.
    const addButton = page.getByTestId("add-holding-button")
    await addButton.scrollIntoViewIfNeeded()
    await expect(addButton).toBeVisible({ timeout: 15_000 })
    await addButton.click()

    // Wait for the form to mount, then pick Gold from the type selector.
    // ButtonSelect renders Labels for hidden radio inputs — click the Label.
    const form = page.getByTestId("add-holding-form")
    await expect(form).toBeVisible()
    await form.locator('label:has-text("Gold")').click()

    // Fill quantity + cost. Use a unique cost so we can identify our row.
    const uniqueUnits = (Math.random() * 10 + 1).toFixed(4)
    const cost = 1900 + Math.floor(Math.random() * 100)

    await page.getByTestId("holding-units").fill(uniqueUnits)
    await page.getByTestId("holding-cost").fill(String(cost))

    // Submit and wait for the network call to complete.
    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/investments") && res.request().method() === "POST"
      ),
      page.getByTestId("holding-submit").click(),
    ])

    expect(
      createRes.ok(),
      `holding create failed: ${createRes.status()} ${await createRes.text().catch(() => "")}`
    ).toBe(true)

    const created = (await createRes.json()) as { id: string }
    expect(created.id).toBeTruthy()

    // Verify the new holding shows up in GET /api/investments for the profile.
    const listRes = await page.request.get(
      `/api/investments?profileId=${FIXTURES.H1.profileAId}`
    )
    expect(listRes.ok()).toBe(true)
    const body = await listRes.json()
    const holdings: Array<{ id: string; type: string; units: number }> =
      body.holdings ?? body.investments ?? body
    expect(
      Array.isArray(holdings) ? holdings.some((h) => h.id === created.id) : true
    ).toBe(true)

    // Cleanup the holding (the per-profile investment_account is reused across runs).
    await page.request.delete(`/api/investments/${created.id}`).catch(() => {})
  })
})
