/**
 * Seed the test Supabase project with reusable households for Playwright tests.
 *
 * Idempotent: re-running upserts the same fixture rows.
 *
 * Usage:
 *   npm run db:test:seed
 *
 * Reads TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_ROLE_KEY from .env.test.local.
 * Refuses to run unless TEST_SUPABASE_URL is set (guards against hitting dev/prod).
 */
import { config as loadEnv } from "dotenv"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const envPath = resolve(process.cwd(), ".env.test.local")
if (existsSync(envPath)) loadEnv({ path: envPath })

const TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL
const TEST_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY

if (!TEST_SUPABASE_URL || !TEST_SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing TEST_SUPABASE_URL or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test.local"
  )
  process.exit(1)
}

// Safety guard: refuse to run if the test URL matches the prod URL declared in .env.local.
function readEnvFile(filename: string): Record<string, string> {
  const path = resolve(process.cwd(), filename)
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = /^([^#=]+)=(.*)$/.exec(line)
    if (m) out[m[1].trim()] = m[2].trim().replaceAll(/^["']|["']$/g, "")
  }
  return out
}
const prodEnv = readEnvFile(".env.local")
const PROD_URL = prodEnv.NEXT_PUBLIC_SUPABASE_URL
if (PROD_URL && PROD_URL.trim() === TEST_SUPABASE_URL.trim()) {
  console.error(
    "Refusing to seed: TEST_SUPABASE_URL matches NEXT_PUBLIC_SUPABASE_URL in .env.local."
  )
  console.error("These must point to DIFFERENT Supabase projects.")
  process.exit(1)
}

// Stable, RFC-4122-valid v4 UUIDs (version "4" in pos 14, variant "8|9|a|b" in pos 19).
export const FIXTURES = {
  H1: {
    householdId: "11111111-1111-4111-8111-111111111111",
    familyId: "22222222-2222-4222-8222-222222222222",
    profileAId: "33333333-3333-4333-8333-333333333333",
    profileBId: "44444444-4444-4444-8444-444444444444",
  },
  H2: {
    householdId: "55555555-5555-4555-8555-555555555555",
  },
} as const

async function main() {
  const supabase = createClient(
    TEST_SUPABASE_URL!,
    TEST_SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log(`Seeding test Supabase: ${TEST_SUPABASE_URL}`)

  // H1 — onboarding complete, with one family and two profiles.
  const { error: h1Err } = await supabase.from("households").upsert(
    {
      id: FIXTURES.H1.householdId,
      user_count: 2,
      onboarding_completed_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  )
  if (h1Err) throw new Error(`H1 household upsert failed: ${h1Err.message}`)

  const { error: f1Err } = await supabase.from("families").upsert(
    {
      id: FIXTURES.H1.familyId,
      household_id: FIXTURES.H1.householdId,
      name: "Test Family",
      user_count: 2,
    },
    { onConflict: "id" }
  )
  if (f1Err) throw new Error(`H1 family upsert failed: ${f1Err.message}`)

  const { error: paErr } = await supabase.from("profiles").upsert(
    {
      id: FIXTURES.H1.profileAId,
      family_id: FIXTURES.H1.familyId,
      name: "Person A",
      birth_year: 1990,
    },
    { onConflict: "id" }
  )
  if (paErr) throw new Error(`H1 profile A upsert failed: ${paErr.message}`)

  const { error: pbErr } = await supabase.from("profiles").upsert(
    {
      id: FIXTURES.H1.profileBId,
      family_id: FIXTURES.H1.familyId,
      name: "Person B",
      birth_year: 1992,
    },
    { onConflict: "id" }
  )
  if (pbErr) throw new Error(`H1 profile B upsert failed: ${pbErr.message}`)

  // H2 — onboarding NOT complete (used for onboarding flow tests).
  const { error: h2Err } = await supabase.from("households").upsert(
    {
      id: FIXTURES.H2.householdId,
      user_count: 2,
      onboarding_completed_at: null,
    },
    { onConflict: "id" }
  )
  if (h2Err) throw new Error(`H2 household upsert failed: ${h2Err.message}`)

  console.log("✅ Seed complete")
  console.log("   H1 (onboarded):", FIXTURES.H1)
  console.log("   H2 (fresh):    ", FIXTURES.H2)
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
