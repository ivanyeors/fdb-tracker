import { defineConfig, devices } from "@playwright/test"
import { config as loadEnv } from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { mapTestPiiKeysToRuntime } from "./e2e/utils/pii-env"

const envPath = resolve(process.cwd(), ".env.test.local")
if (existsSync(envPath)) loadEnv({ path: envPath })

const piiRuntime = mapTestPiiKeysToRuntime(process.env)

const isCI = !!process.env.CI
// Use a non-default port so a local `npm run dev` on 3000 doesn't get reused
// (Playwright would skip starting its own server with E2E_TEST_MODE=1).
const PORT = Number(process.env.PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

// Firefox is opt-in via E2E_INCLUDE_FIREFOX=1. The standard CI matrix runs
// chromium only; the nightly job sets the flag to add Firefox coverage.
const INCLUDE_FIREFOX = process.env.E2E_INCLUDE_FIREFOX === "1"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ...(isCI ? ([["github"]] as const) : []),
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Disable CSS animations + transitions everywhere. visx and Radix popovers
    // both fade in over a few hundred ms; without this, fast assertions can
    // race against the animation frame and intermittently miss elements.
    contextOptions: {
      reducedMotion: "reduce",
    },
    extraHTTPHeaders: {
      "x-e2e-secret": process.env.E2E_TEST_SECRET ?? "",
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
    ...(INCLUDE_FIREFOX
      ? [
          {
            name: "firefox",
            use: {
              ...devices["Desktop Firefox"],
              storageState: "playwright/.auth/user.json",
            },
            dependencies: ["setup"],
            testIgnore: /auth\.setup\.ts/,
          },
        ]
      : []),
  ],
  webServer: {
    // Always use `next start` (not `dev`) — `next dev` can't share .next/ with
    // a separate dev server that may already be running. Requires a prior `npm run build`.
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      E2E_TEST_MODE: "1",
      E2E_TEST_SECRET: process.env.E2E_TEST_SECRET ?? "",
      NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
        process.env.TEST_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "",
      JWT_SECRET: process.env.TEST_JWT_SECRET ?? "",
      PII_ENCRYPTION_KEY_V1: piiRuntime.PII_ENCRYPTION_KEY_V1 ?? "",
      PII_HASH_SECRET_V1: piiRuntime.PII_HASH_SECRET_V1 ?? "",
      TELEGRAM_BOT_TOKEN: process.env.TEST_TELEGRAM_BOT_TOKEN ?? "test-stub",
      NEXT_PUBLIC_APP_URL: BASE_URL,
      CRON_SECRET: process.env.TEST_CRON_SECRET ?? "test-cron-secret",
    },
  },
})
