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

// Stage E is unique because:
// - amount_enc and amount_hash must be populated for EVERY row (not
//   just rows where plaintext was set) — the hash also gates the new
//   full UNIQUE index that replaces the legacy plaintext UNIQUE.
// - balance is nullable, so its check stays conditional.
const checks: Check[] = [
  {
    label: "bank_transactions rows missing amount_enc",
    table: "bank_transactions",
    build: (q) => q.is("amount_enc", null),
  },
  {
    label: "bank_transactions rows missing amount_hash",
    table: "bank_transactions",
    build: (q) => q.is("amount_hash", null),
  },
  {
    label: "bank_transactions rows with balance but no balance_enc",
    table: "bank_transactions",
    build: (q) => q.not("balance", "is", null).is("balance_enc", null),
  },
]

const { count: rowCount } = await sb
  .from("bank_transactions")
  .select("*", { count: "exact", head: true })
console.log(`bank_transactions row count: ${rowCount ?? 0}`)
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

// Bonus: confirm the hash UNIQUE swap will succeed by checking for any
// real duplicates on the new index columns. If duplicates exist, the
// CREATE UNIQUE INDEX in 072 will fail and roll back.
console.log()
console.log("Dedup pre-flight:")
const { data: dupes, error: dupErr } = await sb.rpc("exec_sql", {
  sql: `SELECT COUNT(*) FROM (
    SELECT profile_id, month, txn_date, description, amount_hash, statement_type
    FROM bank_transactions
    GROUP BY 1, 2, 3, 4, 5, 6
    HAVING COUNT(*) > 1
  ) AS dups;`,
})
if (dupErr) {
  // No exec_sql RPC available — fall back to JS-side bucket count.
  const { data: rows, error: rowsErr } = await sb
    .from("bank_transactions")
    .select(
      "profile_id, month, txn_date, description, amount_hash, statement_type",
    )
  if (rowsErr) {
    console.error(`  ✖ pre-flight failed: ${rowsErr.message}`)
    bad++
  } else {
    const buckets = new Map<string, number>()
    for (const r of rows ?? []) {
      const k = [
        r.profile_id,
        r.month,
        r.txn_date,
        r.description,
        r.amount_hash,
        r.statement_type,
      ].join("\u0001")
      buckets.set(k, (buckets.get(k) ?? 0) + 1)
    }
    const dupCount = [...buckets.values()].filter((n) => n > 1).length
    const ok = dupCount === 0
    console.log(
      `  ${ok ? "✓" : "✖"} duplicate hash buckets (would block UNIQUE swap): ${dupCount}`,
    )
    if (!ok) bad++
  }
} else {
  const dupCount = Number(
    (dupes as unknown as Array<{ count: string | number }>)?.[0]?.count ?? 0,
  )
  const ok = dupCount === 0
  console.log(
    `  ${ok ? "✓" : "✖"} duplicate hash buckets (would block UNIQUE swap): ${dupCount}`,
  )
  if (!ok) bad++
}

if (bad > 0) {
  console.error(
    `\n${bad} check(s) failed — fix before applying 072 (the migration runs in one transaction; partial state is fine to rerun).`,
  )
  process.exit(1)
}
console.log("\nAll Stage E coverage checks passed.")
