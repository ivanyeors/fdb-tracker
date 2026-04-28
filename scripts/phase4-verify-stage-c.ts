#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js"
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(2)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

type Check = {
  label: string
  table: string
  build: (q: any) => any
}

// All checks use the "plaintext IS NOT NULL AND enc IS NULL" pattern so a
// row with no plaintext value never gets flagged. The migration header
// notes these tables had 0 rows on dev — these checks confirm prod state.
const checks: Check[] = [
  // tax_noa_data — numeric columns
  {
    label: "tax_noa_data rows with employment_income but no _enc",
    table: "tax_noa_data",
    build: (q) =>
      q.not("employment_income", "is", null).is("employment_income_enc", null),
  },
  {
    label: "tax_noa_data rows with chargeable_income but no _enc",
    table: "tax_noa_data",
    build: (q) =>
      q.not("chargeable_income", "is", null).is("chargeable_income_enc", null),
  },
  {
    label: "tax_noa_data rows with total_deductions but no _enc",
    table: "tax_noa_data",
    build: (q) =>
      q.not("total_deductions", "is", null).is("total_deductions_enc", null),
  },
  {
    label: "tax_noa_data rows with donations_deduction but no _enc",
    table: "tax_noa_data",
    build: (q) =>
      q
        .not("donations_deduction", "is", null)
        .is("donations_deduction_enc", null),
  },
  {
    label: "tax_noa_data rows with reliefs_total but no _enc",
    table: "tax_noa_data",
    build: (q) =>
      q.not("reliefs_total", "is", null).is("reliefs_total_enc", null),
  },
  {
    label: "tax_noa_data rows with tax_payable but no _enc",
    table: "tax_noa_data",
    build: (q) => q.not("tax_payable", "is", null).is("tax_payable_enc", null),
  },
  // tax_noa_data — JSONB columns (now ciphertext under TEXT _enc)
  {
    label: "tax_noa_data rows with reliefs_json but no _enc",
    table: "tax_noa_data",
    build: (q) =>
      q.not("reliefs_json", "is", null).is("reliefs_json_enc", null),
  },
  {
    label: "tax_noa_data rows with bracket_summary_json but no _enc",
    table: "tax_noa_data",
    build: (q) =>
      q
        .not("bracket_summary_json", "is", null)
        .is("bracket_summary_json_enc", null),
  },
  // tax_giro_schedule
  {
    label: "tax_giro_schedule rows with schedule but no _enc",
    table: "tax_giro_schedule",
    build: (q) => q.not("schedule", "is", null).is("schedule_enc", null),
  },
  {
    label: "tax_giro_schedule rows with total_payable but no _enc",
    table: "tax_giro_schedule",
    build: (q) =>
      q.not("total_payable", "is", null).is("total_payable_enc", null),
  },
  {
    label: "tax_giro_schedule rows with outstanding_balance but no _enc",
    table: "tax_giro_schedule",
    build: (q) =>
      q
        .not("outstanding_balance", "is", null)
        .is("outstanding_balance_enc", null),
  },
]

// Also report the raw row counts since these tables were 0 on dev.
const tables = ["tax_noa_data", "tax_giro_schedule"] as const
console.log("Row counts:")
for (const t of tables) {
  const { count } = await sb.from(t).select("*", { count: "exact", head: true })
  console.log(`  ${t}: ${count ?? 0}`)
}
console.log()
console.log("Coverage checks:")

let bad = 0
for (const c of checks) {
  const base = sb.from(c.table).select("*", { count: "exact", head: true })
  const { count, error } = await c.build(base)
  if (error) {
    console.error(`  ✖ ${c.label}: ERROR ${error.message}`)
    bad++
    continue
  }
  const ok = (count ?? 0) === 0
  console.log(`  ${ok ? "✓" : "✖"} ${c.label}: ${count}`)
  if (!ok) bad++
}

if (bad > 0) {
  console.error(`\n${bad} check(s) failed — re-run backfill before proceeding.`)
  process.exit(1)
}
console.log("\nAll Stage C coverage checks passed (0 unencoded rows).")
