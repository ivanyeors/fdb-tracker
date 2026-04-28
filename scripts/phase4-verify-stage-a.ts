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

const checks: Check[] = [
  {
    label: "income_config rows missing annual_salary_enc",
    table: "income_config",
    build: (q) => q.is("annual_salary_enc", null),
  },
  {
    label: "income_config rows missing bonus_estimate_enc",
    table: "income_config",
    build: (q) => q.is("bonus_estimate_enc", null),
  },
  {
    label: "tax_relief_inputs rows missing amount_enc",
    table: "tax_relief_inputs",
    build: (q) => q.is("amount_enc", null),
  },
  {
    label: "tax_relief_auto rows missing amount_enc",
    table: "tax_relief_auto",
    build: (q) => q.is("amount_enc", null),
  },
  {
    label: "income_history rows with plaintext but no monthly_salary_enc",
    table: "income_history",
    build: (q) =>
      q.not("monthly_salary", "is", null).is("monthly_salary_enc", null),
  },
]

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
console.log("\nAll Stage A coverage checks passed (0 unencoded rows).")
