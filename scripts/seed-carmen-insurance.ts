#!/usr/bin/env npx tsx
/**
 * Seed insurance data for Carmen under her family.
 * Data sourced from NTUC Income app screenshots (Mar 2026).
 *
 * Usage:
 *   npx tsx scripts/seed-carmen-insurance.ts
 *   npx tsx scripts/seed-carmen-insurance.ts --dry-run
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvLocal()

const dryRun = process.argv.includes("--dry-run")

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  // 1. Find Carmen's profile
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, family_id, families(id, name)")
    .ilike("name", "%carmen%")

  if (profileError) {
    console.error("Failed to query profiles:", profileError.message)
    process.exit(1)
  }

  if (!profiles || profiles.length === 0) {
    console.error("Could not find any profile matching 'carmen'.")
    process.exit(1)
  }

  const carmen = profiles[0]
  const familyName = (
    Array.isArray(carmen.families)
      ? carmen.families[0]
      : (carmen as any).families
  )?.name

  const profileId = carmen.id
  console.log(
    `Found Carmen: profile_id=${profileId}, family=${familyName ?? "unknown"}`
  )

  // 2. Check for existing insurance policies to avoid duplicates
  const { data: existing } = await supabase
    .from("insurance_policies")
    .select("id, name, policy_number")
    .eq("profile_id", profileId)

  const existingPolicyNumbers = new Set(
    (existing ?? []).map((p) => p.policy_number).filter(Boolean)
  )

  // 3. Define the 3 policies from NTUC Income app screenshots
  const policies = [
    {
      name: "Limited Pay Revosave",
      type: "endowment" as const,
      premium_amount: 3149.85,
      frequency: "yearly" as const,
      insurer: "NTUC Income",
      policy_number: "1808847646",
      inception_date: "2016-03-31",
      end_date: "2036-03-30",
      coverage_amount: 25000,
      coverage_type: "death",
      cash_value: 16121.35,
      premium_waiver: false,
      remarks:
        "Bonus: $1,805.00\nPolicy loan available: $15,315.28\nCash benefit due date: 31 Mar 2027\nTotal deposited cash benefits & interests: $12,746.75\nPremium term: 10 yrs\nAgent: Loo Peck Lu Isis (96216575)",
      coverages: [
        { coverage_type: "death", coverage_amount: 25000 },
      ],
    },
    {
      name: "Living",
      type: "whole_life" as const,
      premium_amount: 73.5,
      frequency: "monthly" as const,
      insurer: "NTUC Income",
      policy_number: "0065157383",
      inception_date: "1994-07-15",
      end_date: null,
      coverage_amount: 50000,
      coverage_type: "critical_illness",
      cash_value: 57652.63,
      premium_waiver: false,
      remarks:
        "Bonus: $46,679.00\nPolicy loan available: $54,770.00\nPremium term: 84 yrs\nAgent: Income-Direct (67881777)",
      coverages: [
        { coverage_type: "critical_illness", coverage_amount: 50000 },
        { coverage_type: "death", coverage_amount: 50000 },
      ],
    },
    {
      name: "Living",
      type: "whole_life" as const,
      premium_amount: 97.5,
      frequency: "monthly" as const,
      insurer: "NTUC Income",
      policy_number: "0012670554",
      inception_date: "2002-06-24",
      end_date: null,
      coverage_amount: 100000,
      coverage_type: "critical_illness",
      cash_value: 46246.83,
      premium_waiver: false,
      remarks:
        "Bonus: $39,392.00\nPolicy loan available: $43,934.49\nPremium term: 76 yrs\nAgent: Loo Peck Lu Isis (96216575)",
      coverages: [
        { coverage_type: "critical_illness", coverage_amount: 100000 },
        { coverage_type: "death", coverage_amount: 100000 },
      ],
    },
  ]

  let inserted = 0
  let skipped = 0

  for (const pol of policies) {
    if (existingPolicyNumbers.has(pol.policy_number)) {
      console.log(
        `  SKIP: ${pol.name} (policy ${pol.policy_number} already exists)`
      )
      skipped++
      continue
    }

    if (dryRun) {
      console.log(
        `  DRY-RUN: Would insert ${pol.name} (${pol.policy_number}) with ${pol.coverages.length} coverage(s)`
      )
      inserted++
      continue
    }

    const { coverages, ...policyData } = pol
    const { data: policy, error: insertError } = await supabase
      .from("insurance_policies")
      .insert({
        profile_id: profileId,
        name: policyData.name,
        type: policyData.type,
        premium_amount: policyData.premium_amount,
        frequency: policyData.frequency,
        insurer: policyData.insurer,
        policy_number: policyData.policy_number,
        inception_date: policyData.inception_date,
        end_date: policyData.end_date,
        coverage_amount: policyData.coverage_amount,
        coverage_type: policyData.coverage_type,
        cash_value: policyData.cash_value,
        premium_waiver: policyData.premium_waiver,
        remarks: policyData.remarks,
        is_active: true,
        deduct_from_outflow: true,
      })
      .select("id")
      .single()

    if (insertError) {
      console.error(`  FAIL: ${pol.name} — ${insertError.message}`)
      continue
    }

    console.log(`  OK: ${pol.name} (${pol.policy_number}) → ${policy.id}`)

    // Insert multi-coverage rows
    if (coverages.length > 0) {
      const { error: covError } = await supabase
        .from("insurance_policy_coverages")
        .insert(
          coverages.map((c, i) => ({
            policy_id: policy.id,
            coverage_type: c.coverage_type,
            coverage_amount: c.coverage_amount,
            sort_order: i,
          }))
        )

      if (covError) {
        console.error(`    Coverage insert failed: ${covError.message}`)
      } else {
        console.log(`    ${coverages.length} coverage(s) added`)
      }
    }

    inserted++
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`)
}

main().catch((err) => {
  console.error("Unhandled error:", err)
  process.exit(1)
})
