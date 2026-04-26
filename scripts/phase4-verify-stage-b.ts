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
    label: "cpf_balances rows missing oa_enc",
    table: "cpf_balances",
    build: (q) => q.is("oa_enc", null),
  },
  {
    label: "cpf_balances rows missing sa_enc",
    table: "cpf_balances",
    build: (q) => q.is("sa_enc", null),
  },
  {
    label: "cpf_balances rows missing ma_enc",
    table: "cpf_balances",
    build: (q) => q.is("ma_enc", null),
  },
  {
    label: "cpf_healthcare_config rows missing csl_annual_enc",
    table: "cpf_healthcare_config",
    build: (q) => q.is("csl_annual_enc", null),
  },
  {
    label: "cpf_healthcare_config rows missing csl_supplement_annual_enc",
    table: "cpf_healthcare_config",
    build: (q) => q.is("csl_supplement_annual_enc", null),
  },
  {
    label: "cpf_healthcare_config rows missing isp_annual_enc",
    table: "cpf_healthcare_config",
    build: (q) => q.is("isp_annual_enc", null),
  },
  {
    label:
      "cpf_healthcare_config rows with msl_annual_override but no msl_annual_override_enc",
    table: "cpf_healthcare_config",
    build: (q) =>
      q
        .not("msl_annual_override", "is", null)
        .is("msl_annual_override_enc", null),
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
console.log("\nAll Stage B coverage checks passed (0 unencoded rows).")
