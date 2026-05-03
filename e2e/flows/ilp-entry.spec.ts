import { test, expect } from "@playwright/test"
import { FIXTURES, STORAGE_STATE_H1_PROFILE_A } from "../utils/auth"

test.use({ storageState: STORAGE_STATE_H1_PROFILE_A })

test.describe("@critical ilp entry", () => {
  test("Add ILP Product form creates a product visible via GET /api/investments/ilp", async ({
    page,
  }) => {
    // Identity (H1 + profile A) baked into storageState — see e2e/auth.setup.ts.
    await page.goto("/dashboard/investments")
    await page.waitForLoadState("networkidle")

    // Switch to the ILP tab.
    await page.getByRole("tab", { name: "ILP", exact: true }).click()

    // Open the Add ILP Product sheet.
    const addButton = page.getByRole("button", {
      name: "Add ILP Product",
      exact: true,
    })
    await expect(addButton).toBeVisible({ timeout: 15_000 })
    await addButton.click()

    // Fill required fields. Use a unique product name so we can match this
    // run's row even if previous test runs left artefacts.
    const productName = `E2E ILP ${Date.now()}`
    await page.locator("#ilp-name").fill(productName)
    await page.locator("#ilp-premium").fill("250")

    // End date uses showIsoInput — the typeable input has aria-label
    // "Date as YYYY-MM-DD" (the popover trigger owns #ilp-end-date instead).
    const endDate = "2035-12-31"
    const endDateInput = page.getByLabel("Date as YYYY-MM-DD")
    await endDateInput.fill(endDate)
    await endDateInput.blur()

    // Submit and wait for POST /api/investments/ilp.
    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/investments/ilp") &&
          res.request().method() === "POST"
      ),
      page.getByRole("button", { name: /Add ILP Product$/ }).last().click(),
    ])
    expect(
      createRes.ok(),
      `ILP create failed: ${createRes.status()} ${await createRes.text().catch(() => "")}`
    ).toBe(true)
    const created = (await createRes.json()) as { id: string; name: string }
    expect(created.id).toBeTruthy()
    expect(created.name).toBe(productName)

    // Verify the product surfaces via GET /api/investments/ilp for the family.
    const listRes = await page.request.get(
      `/api/investments/ilp?familyId=${FIXTURES.H1.familyId}`
    )
    expect(listRes.ok()).toBe(true)
    const body = await listRes.json()
    const products: Array<{ id: string; name: string }> =
      body.products ?? body.ilp ?? body
    expect(
      Array.isArray(products) ? products.some((p) => p.id === created.id) : false,
      `expected ILP id ${created.id} in ${JSON.stringify(products).slice(0, 200)}`
    ).toBe(true)

    // Cleanup so re-runs stay tidy.
    await page.request
      .delete(`/api/investments/ilp/${created.id}`)
      .catch(() => {})
  })
})
