#!/usr/bin/env npx tsx
/**
 * Populates monthly_transaction_summary from existing bank_transactions for
 * every distinct (profile_id, family_id, month, statement_type). Run after
 * migration 063_pii_phase4_add.sql so dashboards switching to summary reads
 * have data on day one.
 *
 * Idempotent — safe to re-run; refreshTransactionSummary deletes/replaces.
 *
 *   npx tsx scripts/populate-transaction-summary.ts
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = /^([^#=]+)=(.*)$/.exec(line)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replaceAll(/^["']|["']$/g, "")
    }
  }
}
loadEnvLocal()

import { refreshTransactionSummary } from "@/lib/repos/monthly-transaction-summary"
import { createSupabaseAdmin } from "@/lib/supabase/server"

async function main() {
  const supabase = createSupabaseAdmin()

  // Fetch every distinct scope. Cast keeps the call type-safe since
  // bank_transactions isn't in database.types.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("bank_transactions")
    .select("profile_id, family_id, month, statement_type")

  if (error) throw new Error(`Scope fetch: ${error.message}`)

  const scopes = new Map<
    string,
    {
      profile_id: string
      family_id: string
      month: string
      statement_type: "bank" | "cc"
    }
  >()
  for (const r of (data ?? []) as Array<{
    profile_id: string
    family_id: string
    month: string
    statement_type: "bank" | "cc"
  }>) {
    scopes.set(`${r.profile_id}|${r.month}|${r.statement_type}`, r)
  }

  console.log(`Refreshing ${scopes.size} (profile, month, statement_type) scopes…`)
  await refreshTransactionSummary(supabase, Array.from(scopes.values()))
  console.log("✅ Summary populated.")
}

main().catch((err) => {
  console.error("Populate failed:", err)
  process.exit(1)
})
