import { test, expect } from "../utils/test"
import { FIXTURES } from "../utils/auth"

test.describe("@critical profile tabs", () => {
  test("switching tabs updates URL profileId param and persists localStorage", async ({
    page,
  }) => {
    // /dashboard renders the profile-toggle in the top nav (storageState session = H1).
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // The toggle must be present with three tabs: Combined, Person A, Person B.
    const toggle = page.getByTestId("profile-toggle")
    await expect(toggle).toBeVisible()
    await expect(page.getByTestId("profile-tab-combined")).toBeVisible()

    // Click Person A → URL gains ?profileId=<A>
    await page.getByTestId(`profile-tab-${FIXTURES.H1.profileAId}`).click()
    await expect(page).toHaveURL(
      new RegExp(`profileId=${FIXTURES.H1.profileAId}`)
    )
    const personAFromLs = await page.evaluate(() =>
      localStorage.getItem("fdb-active-profile-id")
    )
    expect(personAFromLs).toBe(FIXTURES.H1.profileAId)

    // Click Person B → URL profileId switches
    await page.getByTestId(`profile-tab-${FIXTURES.H1.profileBId}`).click()
    await expect(page).toHaveURL(
      new RegExp(`profileId=${FIXTURES.H1.profileBId}`)
    )

    // Click Combined → profileId removed
    await page.getByTestId("profile-tab-combined").click()
    await expect(page).not.toHaveURL(/profileId=/)
  })
})
