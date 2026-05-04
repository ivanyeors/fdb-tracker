import { test as base, expect } from "@playwright/test"

// Patterns that match noise rather than real app errors. Extend as new
// false-positive sources surface — keep entries short and commented so the
// rationale survives churn.
const BENIGN_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  // 4xx network responses surface as "Failed to load resource" console errors
  // in Chromium. Empty-state 4xx (no data yet on a fresh test DB) is expected
  // and not a regression.
  /Failed to load resource/i,
]

export interface PageErrorsTracker {
  all: () => string[]
}

interface PageErrorsFixtures {
  pageErrors: PageErrorsTracker
}

/**
 * Drop-in replacement for `@playwright/test`'s `test`. Adds an auto-fixture
 * `pageErrors` that listens to console errors and 5xx responses on the test's
 * `page` and fails the test at teardown if any accumulated. Specs do not need
 * to reference `pageErrors` to benefit — the assertion runs automatically.
 *
 * Specs that need to inspect captured errors (e.g. assert a specific message)
 * can declare the fixture explicitly: `test("…", async ({ pageErrors }) => …)`.
 */
export const test = base.extend<PageErrorsFixtures>({
  pageErrors: [
    async ({ page }, use, testInfo) => {
      const consoleErrors: string[] = []
      const networkErrors: string[] = []

      page.on("console", (msg) => {
        if (msg.type() !== "error") return
        const text = msg.text()
        if (BENIGN_ERROR_PATTERNS.some((re) => re.test(text))) return
        consoleErrors.push(text)
      })

      page.on("response", (res) => {
        if (res.status() >= 500) {
          networkErrors.push(`${res.status()} ${res.url()}`)
        }
      })

      const tracker: PageErrorsTracker = {
        all: () => [...consoleErrors, ...networkErrors],
      }

      await use(tracker)

      // Skip the assertion if the test already failed — we don't want to mask
      // the original failure with a teardown error. Page errors during a
      // failing run are still visible in the captured logs / artifacts.
      if (testInfo.status !== testInfo.expectedStatus) return

      const captured = tracker.all()
      if (captured.length > 0) {
        throw new Error(
          `pageErrors fixture caught ${captured.length} error(s):\n  ${captured.join("\n  ")}`
        )
      }
    },
    { auto: true },
  ],
})

export { expect }
