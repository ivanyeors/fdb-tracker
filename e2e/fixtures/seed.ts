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

import { applyTestPiiKeysToProcessEnv } from "@/e2e/utils/pii-env"

const envPath = resolve(process.cwd(), ".env.test.local")
if (existsSync(envPath)) loadEnv({ path: envPath })

// Map TEST_PII_* → PII_* (with hex→base64 transcode) so the crypto module
// can be imported below.
applyTestPiiKeysToProcessEnv()

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
  // H3 — fresh, no families/profiles. Reserved for the onboarding full UI
  // walk so it doesn't collide with H2 (used by the skip-endpoint spec).
  H3: {
    householdId: "77777777-7777-4777-8777-777777777777",
  },
  // bank_transactions seed for H1 / Person A. Used by category-edit spec.
  TXN: {
    grabfood: "66666666-6666-4666-8666-666666666601",
    ntuc: "66666666-6666-4666-8666-666666666602",
    grabRide: "66666666-6666-4666-8666-666666666603",
    netflix: "66666666-6666-4666-8666-666666666604",
    salary: "66666666-6666-4666-8666-666666666605",
  },
} as const

// "Current month" the way the dashboard computes it (YYYY-MM-01) so the seed
// rows surface in the default view. txn_date sits mid-month.
function currentMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}
function currentMonthDay(day: number): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// System categories that migration 043 seeds for households existing at
// migration-apply time. H1 is inserted post-migration, so we re-seed here.
const SYSTEM_CATEGORIES: Array<{ name: string; icon: string; sort_order: number }> = [
  { name: "Food & Dining", icon: "utensils", sort_order: 1 },
  { name: "Transport", icon: "car", sort_order: 2 },
  { name: "Housing", icon: "home", sort_order: 3 },
  { name: "Bills & Utilities", icon: "receipt", sort_order: 4 },
  { name: "Shopping", icon: "shopping-bag", sort_order: 5 },
  { name: "Software & Subscriptions", icon: "laptop", sort_order: 6 },
  { name: "Insurance", icon: "shield", sort_order: 7 },
  { name: "Investments & Savings", icon: "trending-up", sort_order: 8 },
  { name: "Transfers", icon: "arrow-right-left", sort_order: 9 },
  { name: "Income", icon: "wallet", sort_order: 10 },
  { name: "Fees & Charges", icon: "badge-percent", sort_order: 11 },
  { name: "CC Payment", icon: "credit-card", sort_order: 12 },
  { name: "Others", icon: "circle-dot", sort_order: 99 },
]

interface SeedTxn {
  id: string
  description: string
  amount: number
  txn_type: "debit" | "credit"
  statement_type: "bank" | "cc"
  category: string | null
  txn_date: string
}

async function main() {
  const { default: postgres } = await import("postgres")
  // Importing the repo (and transitively lib/crypto) requires the PII env
  // vars to be set — we did that above via applyTestPiiKeysToProcessEnv().
  const { encodeBankTransactionPiiPatch } = await import(
    "@/lib/repos/bank-transactions"
  )

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

    // System outflow_categories. Migration 043 only seeds these for households
    // that existed at migration-apply time; H1 is inserted afterwards.
    for (const c of SYSTEM_CATEGORIES) {
      await sql`
        INSERT INTO outflow_categories
          (household_id, name, icon, sort_order, is_system)
        VALUES
          (${FIXTURES.H1.householdId}, ${c.name}, ${c.icon}, ${c.sort_order}, true)
        ON CONFLICT DO NOTHING
      `
    }

    // Resolve category UUIDs we'll attach to seed transactions.
    const catRows = await sql<
      Array<{ id: string; name: string }>
    >`
      SELECT id, name FROM outflow_categories
      WHERE household_id = ${FIXTURES.H1.householdId} AND is_system = true
    `
    const catByName = new Map(catRows.map((r) => [r.name, r.id]))

    // Reset bank_transactions for H1 each run so encrypted amounts re-seed
    // cleanly (the dedup hash UNIQUE INDEX would otherwise reject upserts of
    // existing rows from a prior run with a different ciphertext).
    await sql`DELETE FROM bank_transactions WHERE family_id = ${FIXTURES.H1.familyId}`

    const month = currentMonthStart()
    const txns: SeedTxn[] = [
      {
        id: FIXTURES.TXN.grabfood,
        description: "GRABFOOD SG PTE LTD",
        amount: 25.5,
        txn_type: "debit",
        statement_type: "bank",
        category: "Food & Dining",
        txn_date: currentMonthDay(15),
      },
      {
        id: FIXTURES.TXN.ntuc,
        description: "NTUC FAIRPRICE",
        amount: 89.2,
        txn_type: "debit",
        statement_type: "bank",
        category: "Food & Dining",
        txn_date: currentMonthDay(16),
      },
      {
        id: FIXTURES.TXN.grabRide,
        // Uncategorized on purpose so the category-edit spec can assign one.
        description: "GRAB RIDE 0511",
        amount: 12.4,
        txn_type: "debit",
        statement_type: "bank",
        category: null,
        txn_date: currentMonthDay(17),
      },
      {
        id: FIXTURES.TXN.netflix,
        description: "NETFLIX.COM",
        amount: 19.98,
        txn_type: "debit",
        statement_type: "cc",
        category: "Software & Subscriptions",
        txn_date: currentMonthDay(18),
      },
      {
        id: FIXTURES.TXN.salary,
        description: "SALARY CREDIT",
        amount: 5000.0,
        txn_type: "credit",
        statement_type: "bank",
        category: "Income",
        txn_date: currentMonthDay(1),
      },
    ]

    for (const t of txns) {
      const pii = encodeBankTransactionPiiPatch({ amount: t.amount })
      const categoryId = t.category ? catByName.get(t.category) ?? null : null
      await sql`
        INSERT INTO bank_transactions
          (id, profile_id, family_id, month, txn_date, description,
           txn_type, statement_type, category_id, source,
           amount_enc, amount_hash)
        VALUES
          (${t.id},
           ${FIXTURES.H1.profileAId},
           ${FIXTURES.H1.familyId},
           ${month},
           ${t.txn_date},
           ${t.description},
           ${t.txn_type},
           ${t.statement_type},
           ${categoryId},
           'manual',
           ${pii.amount_enc as string},
           ${pii.amount_hash as string})
      `
    }

    // H2 — onboarding NOT complete (for onboarding flow tests).
    await sql`
      INSERT INTO households (id, user_count, onboarding_completed_at)
      VALUES (${FIXTURES.H2.householdId}, 2, NULL)
      ON CONFLICT (id) DO UPDATE
        SET user_count = excluded.user_count,
            onboarding_completed_at = NULL
    `

    // H3 — fresh, no families/profiles, reserved for onboarding UI walk.
    // Reset between runs by deleting any state the prior walk created.
    await sql`DELETE FROM families WHERE household_id = ${FIXTURES.H3.householdId}`
    await sql`
      INSERT INTO households (id, user_count, onboarding_completed_at)
      VALUES (${FIXTURES.H3.householdId}, 1, NULL)
      ON CONFLICT (id) DO UPDATE
        SET user_count = 1,
            onboarding_completed_at = NULL
    `

    // Refresh PostgREST schema cache so the running app picks up any newly
    // created tables (helpful immediately after a --clean migrate).
    await sql.unsafe("NOTIFY pgrst, 'reload schema';")

    console.log("✅ Seed complete")
    console.log("   H1 (onboarded):", FIXTURES.H1)
    console.log("   H2 (fresh):    ", FIXTURES.H2)
    console.log(`   bank_transactions: ${txns.length} rows for ${month}`)
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
