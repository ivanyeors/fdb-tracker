import type { Page } from "@playwright/test"

/**
 * Listen for console errors and 5xx network responses on the given page.
 * Returns an accessor that yields the collected errors as a list.
 *
 * "Failed to load resource: ..." messages are filtered — those are the browser
 * surfacing 4xx network responses as console messages, not real app errors.
 * Empty-state 4xx (no data yet) is expected on a fresh test DB.
 */
export function trackPageErrors(page: Page) {
  const consoleErrors: string[] = []
  const networkErrors: string[] = []

  page.on("console", (msg) => {
    if (msg.type() !== "error") return
    const text = msg.text()
    if (/Failed to load resource/i.test(text)) return
    consoleErrors.push(text)
  })

  page.on("response", (res) => {
    if (res.status() >= 500) {
      networkErrors.push(`${res.status()} ${res.url()}`)
    }
  })

  return {
    consoleErrors,
    networkErrors,
    all: () => [...consoleErrors, ...networkErrors],
  }
}

