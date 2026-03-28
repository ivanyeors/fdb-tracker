#!/usr/bin/env npx tsx
/**
 * Seed insurance data for Ivan under the Yeo family.
 * Data sourced from advisor PDF: "Ivan Ins coverage.pdf"
 *
 * Usage:
 *   npx tsx scripts/seed-ivan-insurance.ts
 *   npx tsx scripts/seed-ivan-insurance.ts --dry-run
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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  // 1. Find Ivan's profile under the Yeo family
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, family_id, families(id, name)")
    .ilike("name", "%ivan%")

  if (profileError) {
    console.error("Failed to query profiles:", profileError.message)
    process.exit(1)
  }

  // Filter for Yeo family
  const ivan = profiles?.find((p: any) => {
    const family = Array.isArray(p.families) ? p.families[0] : p.families
    return family?.name?.toLowerCase().includes("yeo")
  })

  if (!ivan) {
    console.error("Could not find profile 'Ivan' under 'Yeo' family.")
    console.log("Found profiles:", profiles?.map((p: any) => {
      const fam = Array.isArray(p.families) ? p.families[0] : p.families
      return `${p.name} (family: ${fam?.name})`
    }))
    process.exit(1)
  }

  const profileId = ivan.id
  const familyName = (Array.isArray(ivan.families) ? ivan.families[0] : (ivan as any).families)?.name
  console.log(`Found Ivan: profile_id=${profileId}, family=${familyName}`)

  // 2. Check for existing insurance policies to avoid duplicates
  const { data: existing } = await supabase
    .from("insurance_policies")
    .select("id, name, policy_number")
    .eq("profile_id", profileId)

  const existingPolicyNumbers = new Set(
    (existing ?? []).map((p) => p.policy_number).filter(Boolean)
  )

  // 3. Define the 4 policies from the PDF
  const policies = [
    {
      name: "Singlife CareShield Plus",
      type: "long_term_care" as const,
      premium_amount: 12.41, // monthly
      frequency: "monthly" as const,
      insurer: "Singlife",
      policy_number: "G2266249",
      inception_date: "2024-08-22",
      coverage_till_age: 99,
      cpf_premium: 600.00, // annual CPF
      premium_waiver: false,
      remarks: "Severe Disability Benefit\nPayout Upon: 2/6 ADLs\n1ADL Add-On\nMonthly Benefits: $1,500",
      coverages: [
        { coverage_type: "disability", coverage_amount: 1500 },
      ],
    },
    {
      name: "Singlife Disability Income",
      type: "disability_income" as const,
      premium_amount: 301.30, // yearly
      frequency: "yearly" as const,
      insurer: "Singlife",
      policy_number: "83216774",
      inception_date: "2024-07-25",
      coverage_till_age: 75,
      cpf_premium: null,
      premium_waiver: false,
      remarks: "Deferred Period 3mths, Escalation 0% (Based on MC)\n1. Disability Benefit\n  - Total Disability Benefit\n  - Partial Disability Benefit\n2. Rehabilitation Benefit\n3. Escalation Benefit (only applicable if escalation benefit option is chosen)\n4. Waiver of Premium Benefit\n5. Death Benefit",
      coverages: [
        { coverage_type: "disability", coverage_amount: 3000 },
      ],
    },
    {
      name: "HSBC Life Term Protector (To Age)",
      type: "term_life" as const,
      premium_amount: 180.74, // monthly
      frequency: "monthly" as const,
      insurer: "HSBC Life",
      policy_number: "102-3415019",
      inception_date: "2022-07-29",
      coverage_till_age: 75,
      cpf_premium: null,
      premium_waiver: false,
      remarks: null,
      coverages: [
        { coverage_type: "death", coverage_amount: 700000 },
        { coverage_type: "tpd", coverage_amount: 700000 },
        { coverage_type: "early_critical_illness", coverage_amount: 250000 },
        { coverage_type: "critical_illness", coverage_amount: 450000 },
      ],
    },
    {
      name: "HSBC Life Shield (Plan A) with HSBC Life Enhanced Care (Plan A)",
      type: "integrated_shield" as const,
      premium_amount: 96.30, // monthly (base)
      frequency: "monthly" as const,
      insurer: "HSBC Life",
      policy_number: "302-5718697",
      inception_date: "2022-08-02",
      sub_type: "private",
      rider_name: "HSBC Life Enhanced Care (Plan A)",
      rider_premium: 108.00, // monthly rider
      cpf_premium: 729.00, // annual CPF premium
      premium_waiver: false,
      remarks: "Covers Private and Government Hospitals\nRider: 5% co-pay, capped at $3,000 (Panel)",
      coverages: [
        { coverage_type: "hospitalization", coverage_amount: 0 },
      ],
    },
  ]

  let inserted = 0
  let skipped = 0

  for (const pol of policies) {
    if (existingPolicyNumbers.has(pol.policy_number)) {
      console.log(`  SKIP: ${pol.name} (policy ${pol.policy_number} already exists)`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  DRY-RUN: Would insert ${pol.name} (${pol.policy_number})`)
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
        coverage_till_age: policyData.coverage_till_age ?? null,
        cpf_premium: policyData.cpf_premium ?? null,
        premium_waiver: policyData.premium_waiver,
        remarks: policyData.remarks,
        sub_type: (policyData as any).sub_type ?? null,
        rider_name: (policyData as any).rider_name ?? null,
        rider_premium: (policyData as any).rider_premium ?? null,
        // Legacy fields (first coverage)
        coverage_type: coverages[0]?.coverage_type ?? null,
        coverage_amount: coverages[0]?.coverage_amount ?? null,
        is_active: true,
        deduct_from_outflow: true,
      })
      .select("id")
      .single()

    if (insertError) {
      console.error(`  FAIL: ${pol.name} — ${insertError.message}`)
      continue
    }

    console.log(`  OK: ${pol.name} → ${policy.id}`)

    // Insert multi-coverage rows
    if (coverages.length > 0) {
      const { error: covError } = await supabase
        .from("insurance_policy_coverages")
        .insert(
          coverages.map((c) => ({
            policy_id: policy.id,
            coverage_type: c.coverage_type,
            coverage_amount: c.coverage_amount,
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
