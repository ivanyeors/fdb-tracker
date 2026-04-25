#!/usr/bin/env npx tsx
/**
 * Phase 3 PII backfill — encrypts plaintext rows for financial accounts.
 *
 * Tables and columns covered:
 *   bank_accounts → account_number_enc + account_number_hash + account_number_last4
 *   loans         → lender_enc + principal_enc
 *
 * Idempotent (skips rows where _enc is already populated). Resumable via
 * keyset pagination.
 *
 * Prerequisites:
 *   1. Migration 060_pii_phase3_add.sql applied.
 *   2. PII_ENCRYPTION_KEY_V1 and PII_HASH_SECRET_V1 in .env.local.
 *
 * Run:
 *   npx tsx scripts/backfill-pii-phase3.ts
 */

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

import { encodeBankAccountPiiPatch } from "@/lib/repos/bank-accounts"
import { encodeLoanPiiPatch } from "@/lib/repos/loans"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const BATCH_SIZE = 500
const ZERO_UUID = "00000000-0000-0000-0000-000000000000"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

interface PhaseStat {
  table: string
  scanned: number
  encrypted: number
  skipped: number
  failed: number
}

async function backfillBankAccounts(supabase: SupabaseAdmin): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "bank_accounts",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("bank_accounts")
      .select("id, account_number, account_number_enc")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`bank_accounts fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      if (row.account_number_enc) {
        stat.skipped++
        continue
      }
      if (!row.account_number) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeBankAccountPiiPatch({
          account_number: row.account_number,
        })
        const { error: upErr } = await supabase
          .from("bank_accounts")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`bank_accounts ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[bank_accounts] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function backfillLoans(supabase: SupabaseAdmin): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "loans",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("loans")
      .select("id, lender, lender_enc, principal, principal_enc")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`loans fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      const input: Record<string, unknown> = {}
      if (row.lender && !row.lender_enc) input.lender = row.lender
      if (row.principal != null && !row.principal_enc) {
        input.principal = row.principal
      }
      if (Object.keys(input).length === 0) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeLoanPiiPatch(input)
        const { error: upErr } = await supabase
          .from("loans")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`loans ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[loans] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function verifyCoverage(supabase: SupabaseAdmin): Promise<void> {
  console.log("\n--- Verification ---")

  const { count: bankGap, error: bankErr } = await supabase
    .from("bank_accounts")
    .select("id", { count: "exact", head: true })
    .not("account_number", "is", null)
    .is("account_number_enc", null)
  if (bankErr) throw new Error(`bank_accounts verify: ${bankErr.message}`)
  console.log(
    `bank_accounts with plaintext account_number but no ciphertext: ${bankGap ?? 0}`,
  )

  const { count: loanLenderGap, error: loanLenderErr } = await supabase
    .from("loans")
    .select("id", { count: "exact", head: true })
    .not("lender", "is", null)
    .is("lender_enc", null)
  if (loanLenderErr) throw new Error(`loans lender verify: ${loanLenderErr.message}`)
  console.log(
    `loans with plaintext lender but no ciphertext: ${loanLenderGap ?? 0}`,
  )

  const { count: loanPrincipalGap, error: loanPrincErr } = await supabase
    .from("loans")
    .select("id", { count: "exact", head: true })
    .not("principal", "is", null)
    .is("principal_enc", null)
  if (loanPrincErr) throw new Error(`loans principal verify: ${loanPrincErr.message}`)
  console.log(
    `loans with plaintext principal but no ciphertext: ${loanPrincipalGap ?? 0}`,
  )

  const totalGap = (bankGap ?? 0) + (loanLenderGap ?? 0) + (loanPrincipalGap ?? 0)
  if (totalGap > 0) {
    console.error(
      "\n❌ Coverage incomplete. Investigate failures above before switching reads.",
    )
    process.exit(1)
  }
  console.log("\n✅ Coverage complete for Phase 3 columns.")
}

async function main() {
  const supabase = createSupabaseAdmin()
  const stats: PhaseStat[] = []

  console.log("Backfilling bank_accounts…")
  stats.push(await backfillBankAccounts(supabase))

  console.log("\nBackfilling loans…")
  stats.push(await backfillLoans(supabase))

  console.log("\n--- Summary ---")
  for (const s of stats) {
    console.log(
      `${s.table}: scanned=${s.scanned} encrypted=${s.encrypted} skipped=${s.skipped} failed=${s.failed}`,
    )
  }
  const totalFailed = stats.reduce((a, s) => a + s.failed, 0)
  if (totalFailed > 0) {
    console.error(`\n❌ ${totalFailed} row(s) failed. See errors above.`)
    process.exit(1)
  }

  await verifyCoverage(supabase)
}

main().catch((err) => {
  console.error("Backfill failed:", err)
  process.exit(1)
})
