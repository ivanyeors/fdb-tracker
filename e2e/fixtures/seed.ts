/**
 * Seed the test Supabase project with reusable households for Playwright tests.
 *
 * Idempotent: re-running upserts the same fixture rows.
 *
 * Usage:
 *   npm run db:test:seed
 *
 * Reads TEST_DATABASE_URL from .env.test.local (or process.env in CI). Uses direct
 * SQL via the `postgres` client — bypasses PostgREST's schema cache, which can lag
 * after a fresh `--clean` migration.
 */
import { config as loadEnv } from "dotenv"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const envPath = resolve(process.cwd(), ".env.test.local")
if (existsSync(envPath)) loadEnv({ path: envPath })

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL

if (!TEST_DATABASE_URL) {
  console.error("Missing TEST_DATABASE_URL in .env.test.local / process.env")
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
if (
  PROD_URL &&
  TEST_SUPABASE_URL &&
  PROD_URL.trim() === TEST_SUPABASE_URL.trim()
) {
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
  const { default: postgres } = await import("postgres")
  const sql = postgres(TEST_DATABASE_URL!, { max: 1 })

  console.log("Seeding test Supabase via direct SQL...")

  try {
    // H1 — onboarded, with one family and two profiles.
    await sql`
      INSERT INTO households (id, user_count, onboarding_completed_at)
      VALUES (${FIXTURES.H1.householdId}, 2, now())
      ON CONFLICT (id) DO UPDATE
        SET user_count = excluded.user_count,
            onboarding_completed_at = excluded.onboarding_completed_at
    `
    await sql`
      INSERT INTO families (id, household_id, name, user_count)
      VALUES (${FIXTURES.H1.familyId}, ${FIXTURES.H1.householdId}, 'Test Family', 2)
      ON CONFLICT (id) DO UPDATE
        SET name = excluded.name,
            user_count = excluded.user_count
    `
    await sql`
      INSERT INTO profiles (id, family_id, name, birth_year)
      VALUES (${FIXTURES.H1.profileAId}, ${FIXTURES.H1.familyId}, 'Person A', 1990)
      ON CONFLICT (id) DO UPDATE
        SET name = excluded.name,
            birth_year = excluded.birth_year
    `
    await sql`
      INSERT INTO profiles (id, family_id, name, birth_year)
      VALUES (${FIXTURES.H1.profileBId}, ${FIXTURES.H1.familyId}, 'Person B', 1992)
      ON CONFLICT (id) DO UPDATE
        SET name = excluded.name,
            birth_year = excluded.birth_year
    `
    // Reset investment_accounts and investments for the H1 family between runs
    // so holding-buy tests start from a clean slate. Cascades to investment_transactions.
    await sql`DELETE FROM investments WHERE family_id = ${FIXTURES.H1.familyId}`
    await sql`DELETE FROM investment_accounts WHERE family_id = ${FIXTURES.H1.familyId}`

    // H2 — onboarding NOT complete (for onboarding flow tests).
    await sql`
      INSERT INTO households (id, user_count, onboarding_completed_at)
      VALUES (${FIXTURES.H2.householdId}, 2, NULL)
      ON CONFLICT (id) DO UPDATE
        SET user_count = excluded.user_count,
            onboarding_completed_at = NULL
    `

    // Refresh PostgREST schema cache so the running app picks up any newly
    // created tables (helpful immediately after a --clean migrate).
    await sql.unsafe("NOTIFY pgrst, 'reload schema';")

    console.log("✅ Seed complete")
    console.log("   H1 (onboarded):", FIXTURES.H1)
    console.log("   H2 (fresh):    ", FIXTURES.H2)
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
