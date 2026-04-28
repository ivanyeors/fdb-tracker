#!/usr/bin/env npx tsx
/**
 * Phase 4 PII backfill — encrypts plaintext financial amounts across the
 * 11 tables added in migration 063_pii_phase4_add.sql.
 *
 * Idempotent (skips rows where _enc is already populated). Resumable via
 * keyset pagination. Each table is processed independently — if one fails
 * partway, re-running picks up at the last cursor for that table.
 *
 * Tables and columns covered:
 *   bank_transactions     → amount_enc + amount_hash + balance_enc
 *   monthly_cashflow      → inflow_enc, outflow_enc
 *   income_config         → annual_salary_enc, bonus_estimate_enc
 *   income_history        → monthly_salary_enc
 *   cpf_balances          → oa_enc, sa_enc, ma_enc
 *   cpf_healthcare_config → msl_annual_override_enc, csl_annual_enc,
 *                           csl_supplement_annual_enc, isp_annual_enc
 *   tax_noa_data          → 6 numeric + 2 jsonb _enc columns
 *   tax_giro_schedule     → schedule_enc, total_payable_enc,
 *                           outstanding_balance_enc
 *   tax_relief_inputs     → amount_enc
 *   tax_relief_auto       → amount_enc
 *   insurance_policies    → premium_amount_enc, coverage_amount_enc
 *
 * Prerequisites:
 *   1. Migration 063_pii_phase4_add.sql applied.
 *   2. PII_ENCRYPTION_KEY_V1 and PII_HASH_SECRET_V1 in .env.local.
 *
 * Run:
 *   npx tsx scripts/backfill-pii-phase4.ts
 *   npx tsx scripts/backfill-pii-phase4.ts --table bank_transactions  # single
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

import { encodeBankTransactionPiiPatch } from "@/lib/repos/bank-transactions"
import { encodeCpfBalancesPiiPatch } from "@/lib/repos/cpf-balances"
import { encodeCpfHealthcareConfigPiiPatch } from "@/lib/repos/cpf-healthcare-config"
import { encodeIncomeConfigPiiPatch } from "@/lib/repos/income-config"
import { encodeIncomeHistoryPiiPatch } from "@/lib/repos/income-history"
import { encodeInsurancePoliciesPiiPatch } from "@/lib/repos/insurance-policies"
import { encodeMonthlyCashflowPiiPatch } from "@/lib/repos/monthly-cashflow"
import { encodeTaxGiroSchedulePiiPatch } from "@/lib/repos/tax-giro-schedule"
import { encodeTaxNoaDataPiiPatch } from "@/lib/repos/tax-noa-data"
import { encodeTaxReliefAutoPiiPatch } from "@/lib/repos/tax-relief-auto"
import { encodeTaxReliefInputsPiiPatch } from "@/lib/repos/tax-relief-inputs"
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

// Generic keyset-paginated walker. The encoder receives a row and returns
// an UPDATE patch (or null to skip). The check function decides if the
// row is already done.
async function walkAndEncrypt<Row extends { id: string }>(opts: {
  table: string
  selectCols: string
  encode: (row: Row) => Record<string, unknown> | null
  supabase: SupabaseAdmin
}): Promise<PhaseStat> {
  const { table, selectCols, encode, supabase } = opts
  const stat: PhaseStat = {
    table,
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data, error } = await supabase
      // bank_transactions / monthly_transaction_summary aren't in
      // database.types.ts; cast keeps the loop generic across all tables.
      .from(table as never)
      .select(`id, ${selectCols}`)
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`${table} fetch: ${error.message}`)
    const rows = (data as Row[] | null) ?? []
    if (rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      let patch: Record<string, unknown> | null
      try {
        patch = encode(row)
      } catch (e) {
        stat.failed++
        console.error(`${table} ${row.id} encode:`, e)
        continue
      }
      if (!patch || Object.keys(patch).length === 0) {
        stat.skipped++
        continue
      }
      const { error: upErr } = await supabase
        .from(table as never)
        .update(patch as never)
        .eq("id", row.id)
      if (upErr) {
        stat.failed++
        console.error(`${table} ${row.id} update:`, upErr.message)
      } else {
        stat.encrypted++
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[${table}] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} skipped=${stat.skipped} failed=${stat.failed}`,
    )
  }

  return stat
}

// ─── Per-table encoders. Each maps a row to a patch (or null to skip). ──

function encodeBankTransactionRow(row: {
  amount: number | null
  amount_enc: string | null
  balance: number | null
  balance_enc: string | null
}): Record<string, unknown> | null {
  const input: { amount?: number | null; balance?: number | null } = {}
  if (row.amount != null && !row.amount_enc) input.amount = row.amount
  if (row.balance != null && !row.balance_enc) input.balance = row.balance
  return Object.keys(input).length === 0
    ? null
    : encodeBankTransactionPiiPatch(input)
}

function encodeMonthlyCashflowRow(row: {
  inflow: number | null
  inflow_enc: string | null
  outflow: number | null
  outflow_enc: string | null
}): Record<string, unknown> | null {
  const input: { inflow?: number | null; outflow?: number | null } = {}
  if (row.inflow != null && !row.inflow_enc) input.inflow = row.inflow
  if (row.outflow != null && !row.outflow_enc) input.outflow = row.outflow
  return Object.keys(input).length === 0
    ? null
    : encodeMonthlyCashflowPiiPatch(input)
}

function encodeIncomeConfigRow(row: {
  annual_salary: number | null
  annual_salary_enc: string | null
  bonus_estimate: number | null
  bonus_estimate_enc: string | null
}): Record<string, unknown> | null {
  const input: {
    annual_salary?: number | null
    bonus_estimate?: number | null
  } = {}
  if (row.annual_salary != null && !row.annual_salary_enc) {
    input.annual_salary = row.annual_salary
  }
  if (row.bonus_estimate != null && !row.bonus_estimate_enc) {
    input.bonus_estimate = row.bonus_estimate
  }
  return Object.keys(input).length === 0
    ? null
    : encodeIncomeConfigPiiPatch(input)
}

function encodeIncomeHistoryRow(row: {
  monthly_salary: number | null
  monthly_salary_enc: string | null
}): Record<string, unknown> | null {
  if (row.monthly_salary == null || row.monthly_salary_enc) return null
  return encodeIncomeHistoryPiiPatch({ monthly_salary: row.monthly_salary })
}

function encodeCpfBalancesRow(row: {
  oa: number | null
  oa_enc: string | null
  sa: number | null
  sa_enc: string | null
  ma: number | null
  ma_enc: string | null
}): Record<string, unknown> | null {
  const input: {
    oa?: number | null
    sa?: number | null
    ma?: number | null
  } = {}
  if (row.oa != null && !row.oa_enc) input.oa = row.oa
  if (row.sa != null && !row.sa_enc) input.sa = row.sa
  if (row.ma != null && !row.ma_enc) input.ma = row.ma
  return Object.keys(input).length === 0 ? null : encodeCpfBalancesPiiPatch(input)
}

function encodeCpfHealthcareConfigRow(row: {
  msl_annual_override: number | null
  msl_annual_override_enc: string | null
  csl_annual: number | null
  csl_annual_enc: string | null
  csl_supplement_annual: number | null
  csl_supplement_annual_enc: string | null
  isp_annual: number | null
  isp_annual_enc: string | null
}): Record<string, unknown> | null {
  const input: {
    msl_annual_override?: number | null
    csl_annual?: number | null
    csl_supplement_annual?: number | null
    isp_annual?: number | null
  } = {}
  if (row.msl_annual_override != null && !row.msl_annual_override_enc) {
    input.msl_annual_override = row.msl_annual_override
  }
  if (row.csl_annual != null && !row.csl_annual_enc) {
    input.csl_annual = row.csl_annual
  }
  if (row.csl_supplement_annual != null && !row.csl_supplement_annual_enc) {
    input.csl_supplement_annual = row.csl_supplement_annual
  }
  if (row.isp_annual != null && !row.isp_annual_enc) {
    input.isp_annual = row.isp_annual
  }
  return Object.keys(input).length === 0
    ? null
    : encodeCpfHealthcareConfigPiiPatch(input)
}

function encodeTaxNoaDataRow(row: {
  employment_income: number | null
  employment_income_enc: string | null
  chargeable_income: number | null
  chargeable_income_enc: string | null
  total_deductions: number | null
  total_deductions_enc: string | null
  donations_deduction: number | null
  donations_deduction_enc: string | null
  reliefs_total: number | null
  reliefs_total_enc: string | null
  tax_payable: number | null
  tax_payable_enc: string | null
  reliefs_json: unknown
  reliefs_json_enc: string | null
  bracket_summary_json: unknown
  bracket_summary_json_enc: string | null
}): Record<string, unknown> | null {
  const input: Record<string, unknown> = {}
  const numCols = [
    "employment_income",
    "chargeable_income",
    "total_deductions",
    "donations_deduction",
    "reliefs_total",
    "tax_payable",
  ] as const
  for (const c of numCols) {
    const encKey = `${c}_enc` as const
    if (row[c] != null && !row[encKey]) input[c] = row[c]
  }
  if (row.reliefs_json != null && !row.reliefs_json_enc) {
    input.reliefs_json = row.reliefs_json
  }
  if (row.bracket_summary_json != null && !row.bracket_summary_json_enc) {
    input.bracket_summary_json = row.bracket_summary_json
  }
  return Object.keys(input).length === 0 ? null : encodeTaxNoaDataPiiPatch(input)
}

function encodeTaxGiroScheduleRow(row: {
  schedule: unknown
  schedule_enc: string | null
  total_payable: number | null
  total_payable_enc: string | null
  outstanding_balance: number | null
  outstanding_balance_enc: string | null
}): Record<string, unknown> | null {
  const input: {
    schedule?: unknown
    total_payable?: number | null
    outstanding_balance?: number | null
  } = {}
  if (row.schedule != null && !row.schedule_enc) input.schedule = row.schedule
  if (row.total_payable != null && !row.total_payable_enc) {
    input.total_payable = row.total_payable
  }
  if (row.outstanding_balance != null && !row.outstanding_balance_enc) {
    input.outstanding_balance = row.outstanding_balance
  }
  return Object.keys(input).length === 0
    ? null
    : encodeTaxGiroSchedulePiiPatch(input)
}

function encodeAmountOnlyRow(table: "tax_relief_inputs" | "tax_relief_auto") {
  const enc =
    table === "tax_relief_inputs"
      ? encodeTaxReliefInputsPiiPatch
      : encodeTaxReliefAutoPiiPatch
  return (row: {
    amount: number | null
    amount_enc: string | null
  }): Record<string, unknown> | null => {
    if (row.amount == null || row.amount_enc) return null
    return enc({ amount: row.amount })
  }
}

function encodeInsurancePoliciesRow(row: {
  premium_amount: number | null
  premium_amount_enc: string | null
  coverage_amount: number | null
  coverage_amount_enc: string | null
}): Record<string, unknown> | null {
  const input: {
    premium_amount?: number | null
    coverage_amount?: number | null
  } = {}
  if (row.premium_amount != null && !row.premium_amount_enc) {
    input.premium_amount = row.premium_amount
  }
  if (row.coverage_amount != null && !row.coverage_amount_enc) {
    input.coverage_amount = row.coverage_amount
  }
  return Object.keys(input).length === 0
    ? null
    : encodeInsurancePoliciesPiiPatch(input)
}

// ─── Main ───────────────────────────────────────────────────────────────

const TABLES = [
  {
    name: "bank_transactions",
    cols: "amount, amount_enc, balance, balance_enc",
    encode: encodeBankTransactionRow,
  },
  {
    name: "monthly_cashflow",
    cols: "inflow, inflow_enc, outflow, outflow_enc",
    encode: encodeMonthlyCashflowRow,
  },
  {
    name: "income_config",
    cols: "annual_salary, annual_salary_enc, bonus_estimate, bonus_estimate_enc",
    encode: encodeIncomeConfigRow,
  },
  {
    name: "income_history",
    cols: "monthly_salary, monthly_salary_enc",
    encode: encodeIncomeHistoryRow,
  },
  {
    name: "cpf_balances",
    cols: "oa, oa_enc, sa, sa_enc, ma, ma_enc",
    encode: encodeCpfBalancesRow,
  },
  {
    name: "cpf_healthcare_config",
    cols: "msl_annual_override, msl_annual_override_enc, csl_annual, csl_annual_enc, csl_supplement_annual, csl_supplement_annual_enc, isp_annual, isp_annual_enc",
    encode: encodeCpfHealthcareConfigRow,
  },
  {
    name: "tax_noa_data",
    cols: "employment_income, employment_income_enc, chargeable_income, chargeable_income_enc, total_deductions, total_deductions_enc, donations_deduction, donations_deduction_enc, reliefs_total, reliefs_total_enc, tax_payable, tax_payable_enc, reliefs_json, reliefs_json_enc, bracket_summary_json, bracket_summary_json_enc",
    encode: encodeTaxNoaDataRow,
  },
  {
    name: "tax_giro_schedule",
    cols: "schedule, schedule_enc, total_payable, total_payable_enc, outstanding_balance, outstanding_balance_enc",
    encode: encodeTaxGiroScheduleRow,
  },
  {
    name: "tax_relief_inputs",
    cols: "amount, amount_enc",
    encode: encodeAmountOnlyRow("tax_relief_inputs"),
  },
  {
    name: "tax_relief_auto",
    cols: "amount, amount_enc",
    encode: encodeAmountOnlyRow("tax_relief_auto"),
  },
  {
    name: "insurance_policies",
    cols: "premium_amount, premium_amount_enc, coverage_amount, coverage_amount_enc",
    encode: encodeInsurancePoliciesRow,
  },
] as const

async function main() {
  const flagIdx = process.argv.indexOf("--table")
  const only = flagIdx >= 0 ? process.argv[flagIdx + 1] : null
  const targets = only ? TABLES.filter((t) => t.name === only) : TABLES
  if (only && targets.length === 0) {
    console.error(`Unknown table: ${only}`)
    console.error(`Valid: ${TABLES.map((t) => t.name).join(", ")}`)
    process.exit(2)
  }

  const supabase = createSupabaseAdmin()
  const stats: PhaseStat[] = []

  for (const t of targets) {
    console.log(`\nBackfilling ${t.name}…`)
    stats.push(
      await walkAndEncrypt({
        table: t.name,
        selectCols: t.cols,
        // Cast — each encoder is typed against its own row shape, but
        // walkAndEncrypt is generic. The dynamic SELECT guarantees the
        // shape matches.
        encode: t.encode as unknown as (
          row: { id: string },
        ) => Record<string, unknown> | null,
        supabase,
      }),
    )
  }

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
  console.log("\n✅ Phase 4 backfill complete.")
}

main().catch((err) => {
  console.error("Backfill failed:", err)
  process.exit(1)
})
