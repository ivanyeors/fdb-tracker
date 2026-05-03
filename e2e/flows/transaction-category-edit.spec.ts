import { test, expect } from "../utils/test"
import { FIXTURES, STORAGE_STATE_H1_PROFILE_A } from "../utils/auth"

test.use({ storageState: STORAGE_STATE_H1_PROFILE_A })

// Hard-coded to mirror seed.ts — the seed re-inserts these UUIDs on every run.
const TXN_GRAB_RIDE = "66666666-6666-4666-8666-666666666603"
const TXN_GRAB_RIDE_DESC = "GRAB RIDE 0511"

test.describe("@critical transaction category edit", () => {
  test("re-categorizing a transaction persists via PATCH /api/transactions", async ({
    page,
  }) => {
    // Identity (H1 + profile A) baked into storageState — see e2e/auth.setup.ts.

    // Reset the GRAB RIDE row to uncategorized so the spec is idempotent —
    // a prior run would otherwise have left it categorized as Transport.
    await page.request.patch("/api/transactions", {
      data: {
        updates: [{ id: TXN_GRAB_RIDE, categoryId: null }],
      },
    })

    const monthParam = (() => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    })()
    const beforeRes = await page.request.get(
      `/api/transactions?profileId=${FIXTURES.H1.profileAId}&month=${monthParam}`
    )
    expect(beforeRes.ok()).toBe(true)
    const beforeRows = (await beforeRes.json()) as Array<{
      id: string
      category_id: string | null
      outflow_categories: { name: string } | null
    }>
    const seedRow = beforeRows.find((r) => r.id === TXN_GRAB_RIDE)
    expect(
      seedRow,
      `seed transaction ${TXN_GRAB_RIDE} not found in /api/transactions response`
    ).toBeTruthy()
    expect(seedRow!.category_id).toBeNull()

    // Navigate to the spending tab — that's where TransactionTable lives.
    await page.goto("/dashboard/cashflow?tab=categories")
    await page.waitForLoadState("networkidle")

    // Locate the seed row by its (unique) description.
    const row = page.getByRole("row", { name: new RegExp(TXN_GRAB_RIDE_DESC) })
    await expect(row).toBeVisible({ timeout: 15_000 })

    // Open the row's category Select trigger and pick Transport. shadcn/Radix
    // Select renders the popover via portal, so the option lookup uses the page
    // root (not the row).
    const trigger = row.getByRole("combobox")
    await trigger.click()
    await page.getByRole("option", { name: "Transport", exact: true }).click()

    // Save changes — the button only appears once the local change map is non-empty.
    const saveButton = page.getByRole("button", { name: /^Save \d+ changes?$/ })
    await expect(saveButton).toBeVisible()

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/transactions") &&
          res.request().method() === "PATCH"
      ),
      saveButton.click(),
    ])
    expect(
      patchRes.ok(),
      `PATCH failed: ${patchRes.status()} ${await patchRes.text().catch(() => "")}`
    ).toBe(true)

    // Verify persistence via API. Re-fetch the same scope and assert the
    // affected row now has Transport.
    const afterRes = await page.request.get(
      `/api/transactions?profileId=${FIXTURES.H1.profileAId}&month=${monthParam}`
    )
    expect(afterRes.ok()).toBe(true)
    const afterRows = (await afterRes.json()) as Array<{
      id: string
      category_id: string | null
      outflow_categories: { name: string } | null
    }>
    const updated = afterRows.find((r) => r.id === TXN_GRAB_RIDE)
    expect(updated, "updated row not found").toBeTruthy()
    expect(updated!.category_id).not.toBeNull()
    expect(updated!.outflow_categories?.name).toBe("Transport")
  })
})
