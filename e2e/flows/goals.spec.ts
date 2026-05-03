import { test, expect } from "../utils/test"
import { FIXTURES } from "../utils/auth"

test.describe("@critical goals", () => {
  test("goal created via API is returned by GET /api/goals (family scope)", async ({
    page,
  }) => {
    const goalName = `E2E Goal ${Date.now()}`

    // Default storage state is H1 (familyId set, profileId not set).
    const createRes = await page.request.post("/api/goals", {
      data: {
        familyId: FIXTURES.H1.familyId,
        name: goalName,
        targetAmount: 12345,
        category: "custom",
        deadline: null,
      },
    })
    const createBody = await createRes.text()
    expect(
      createRes.ok(),
      `goal create failed: ${createRes.status()} ${createBody}`
    ).toBe(true)

    const created = (await JSON.parse(createBody)) as { id: string }

    // GET /api/goals scoped to the family must return the new goal.
    const listRes = await page.request.get(
      `/api/goals?familyId=${FIXTURES.H1.familyId}`
    )
    expect(listRes.ok()).toBe(true)
    const goals = (await listRes.json()) as Array<{ id: string; name: string }>
    expect(goals.some((g) => g.id === created.id && g.name === goalName)).toBe(
      true
    )

    // Cleanup so re-runs stay tidy.
    await page.request.delete(`/api/goals/${created.id}`)
  })
})
