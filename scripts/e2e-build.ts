#!/usr/bin/env npx tsx
/**
 * Run `next build` with test env vars (TEST_* mapped to runtime names) so the
 * client bundle doesn't bake in prod Supabase URLs from .env.local.
 *
 * Usage: npm run e2e:build
 */
import { spawn } from "node:child_process"
import { config as loadEnv } from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

// Locally we load TEST_* from .env.test.local; in CI those are already in process.env from secrets.
const envPath = resolve(process.cwd(), ".env.test.local")
if (existsSync(envPath)) {
  loadEnv({ path: envPath })
} else if (!process.env.TEST_SUPABASE_URL) {
  console.error(
    "Missing .env.test.local and no TEST_SUPABASE_URL in process.env. " +
      "Locally, copy .env.test.example. In CI, ensure GitHub secrets are wired through."
  )
  process.exit(1)
}

// Map TEST_* values to the runtime env names Next.js expects.
const map: Record<string, string> = {
  TEST_SUPABASE_URL: "NEXT_PUBLIC_SUPABASE_URL",
  TEST_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  TEST_SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
  TEST_JWT_SECRET: "JWT_SECRET",
  TEST_PII_ENCRYPTION_KEY_V1: "PII_ENCRYPTION_KEY_V1",
  TEST_PII_HASH_SECRET_V1: "PII_HASH_SECRET_V1",
  TEST_TELEGRAM_BOT_TOKEN: "TELEGRAM_BOT_TOKEN",
  TEST_CRON_SECRET: "CRON_SECRET",
}

const env: Record<string, string> = {}
// Start fresh — do NOT inherit prod NEXT_PUBLIC_* from the calling shell.
const passthroughKeys = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NPM_CONFIG_PREFIX",
  // CI runners
  "CI",
  "GITHUB_ACTIONS",
  "RUNNER_TEMP",
  "RUNNER_OS",
]
for (const k of passthroughKeys) {
  if (process.env[k]) env[k] = process.env[k]
}

for (const [from, to] of Object.entries(map)) {
  const val = process.env[from]
  if (val) env[to] = val
}
env.E2E_TEST_MODE = "1"
env.E2E_TEST_SECRET = process.env.E2E_TEST_SECRET ?? ""
env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3100"
env.NODE_ENV = "production"

console.log("Building with test env (TEST_* → runtime names)")
const child = spawn("npm", ["run", "build"], {
  env: env as NodeJS.ProcessEnv,
  stdio: "inherit",
  shell: false,
})
child.on("exit", (code) => process.exit(code ?? 0))
