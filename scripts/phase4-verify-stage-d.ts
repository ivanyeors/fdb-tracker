#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "")
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

const checks: Check[] = [
  {
    label: "monthly_cashflow rows with inflow but no inflow_enc",
    table: "monthly_cashflow",
    build: (q) => q.not("inflow", "is", null).is("inflow_enc", null),
  },
  {
    label: "monthly_cashflow rows with outflow but no outflow_enc",
    table: "monthly_cashflow",
    build: (q) => q.not("outflow", "is", null).is("outflow_enc", null),
  },
  {
    label: "insurance_policies rows with premium_amount but no _enc",
    table: "insurance_policies",
    build: (q) =>
      q.not("premium_amount", "is", null).is("premium_amount_enc", null),
  },
  {
    label: "insurance_policies rows with coverage_amount but no _enc",
    table: "insurance_policies",
    build: (q) =>
      q.not("coverage_amount", "is", null).is("coverage_amount_enc", null),
  },
]

const tables = ["monthly_cashflow", "insurance_policies"] as const
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
console.log("\nAll Stage D coverage checks passed (0 unencoded rows).")
