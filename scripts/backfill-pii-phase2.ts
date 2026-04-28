#!/usr/bin/env npx tsx
/**
 * Phase 2 PII backfill — encrypts plaintext rows for direct identifiers,
 * Telegram lookup columns, family/dependent names, and birth_year/income.
 *
 * Tables and columns covered:
 *   profiles                 → name, birth_year, telegram_user_id,
 *                              telegram_username, telegram_chat_id
 *   households               → telegram_chat_id
 *   linked_telegram_accounts → telegram_user_id, telegram_username,
 *                              telegram_chat_id
 *   signup_codes             → telegram_username, used_by_telegram_user_id
 *   families                 → name
 *   dependents               → name, birth_year, annual_income
 *
 * Idempotent (skips rows where _enc is already populated). Resumable via
 * keyset pagination.
 *
 * Prerequisites:
 *   1. Migration 059_pii_phase2_add.sql applied.
 *   2. PII_ENCRYPTION_KEY_V1 and PII_HASH_SECRET_V1 in .env.local.
 *
 * Run:
 *   npx tsx scripts/backfill-pii-phase2.ts
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

import { encodeDependentPiiPatch } from "@/lib/repos/dependents"
import { encodeFamilyPiiPatch } from "@/lib/repos/families"
import { encodeHouseholdPiiPatch } from "@/lib/repos/households"
import { encodeLinkedTelegramAccountPiiPatch } from "@/lib/repos/linked-telegram-accounts"
import { encodeProfilePiiPatch } from "@/lib/repos/profiles"
import { encodeSignupCodePiiPatch } from "@/lib/repos/signup-codes"
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

function emptyPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length === 0
}

async function backfillProfiles(supabase: SupabaseAdmin): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "profiles",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("profiles")
      .select(
        "id, name, name_enc, birth_year, birth_year_enc, telegram_user_id, telegram_user_id_enc, telegram_username, telegram_username_enc, telegram_chat_id, telegram_chat_id_enc",
      )
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`profiles fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      const input: Record<string, unknown> = {}
      if (row.name && !row.name_enc) input.name = row.name
      if (row.birth_year != null && !row.birth_year_enc) {
        input.birth_year = row.birth_year
      }
      if (row.telegram_user_id && !row.telegram_user_id_enc) {
        input.telegram_user_id = row.telegram_user_id
      }
      if (row.telegram_username && !row.telegram_username_enc) {
        input.telegram_username = row.telegram_username
      }
      if (row.telegram_chat_id && !row.telegram_chat_id_enc) {
        input.telegram_chat_id = row.telegram_chat_id
      }
      if (Object.keys(input).length === 0) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeProfilePiiPatch(input)
        if (emptyPatch(patch)) {
          stat.skipped++
          continue
        }
        const { error: upErr } = await supabase
          .from("profiles")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`profiles ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[profiles] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function backfillHouseholds(supabase: SupabaseAdmin): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "households",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("households")
      .select("id, telegram_chat_id, telegram_chat_id_enc")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`households fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      if (!row.telegram_chat_id || row.telegram_chat_id_enc) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeHouseholdPiiPatch({
          telegram_chat_id: row.telegram_chat_id,
        })
        const { error: upErr } = await supabase
          .from("households")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`households ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[households] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function backfillLinkedTelegramAccounts(
  supabase: SupabaseAdmin,
): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "linked_telegram_accounts",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("linked_telegram_accounts")
      .select(
        "id, telegram_user_id, telegram_user_id_enc, telegram_username, telegram_username_enc, telegram_chat_id, telegram_chat_id_enc",
      )
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`linked_telegram_accounts fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      const input: Record<string, unknown> = {}
      if (row.telegram_user_id && !row.telegram_user_id_enc) {
        input.telegram_user_id = row.telegram_user_id
      }
      if (row.telegram_username && !row.telegram_username_enc) {
        input.telegram_username = row.telegram_username
      }
      if (row.telegram_chat_id && !row.telegram_chat_id_enc) {
        input.telegram_chat_id = row.telegram_chat_id
      }
      if (Object.keys(input).length === 0) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeLinkedTelegramAccountPiiPatch(input)
        const { error: upErr } = await supabase
          .from("linked_telegram_accounts")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`linked_telegram_accounts ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[linked_telegram_accounts] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function backfillSignupCodes(supabase: SupabaseAdmin): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "signup_codes",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("signup_codes")
      .select(
        "id, telegram_username, telegram_username_enc, used_by_telegram_user_id, used_by_telegram_user_id_enc",
      )
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`signup_codes fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      const input: Record<string, unknown> = {}
      if (row.telegram_username && !row.telegram_username_enc) {
        input.telegram_username = row.telegram_username
      }
      if (row.used_by_telegram_user_id && !row.used_by_telegram_user_id_enc) {
        input.used_by_telegram_user_id = row.used_by_telegram_user_id
      }
      if (Object.keys(input).length === 0) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeSignupCodePiiPatch(input)
        const { error: upErr } = await supabase
          .from("signup_codes")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`signup_codes ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[signup_codes] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function backfillFamilies(supabase: SupabaseAdmin): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "families",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("families")
      .select("id, name, name_enc")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`families fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      if (!row.name || row.name_enc) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeFamilyPiiPatch({ name: row.name })
        const { error: upErr } = await supabase
          .from("families")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`families ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[families] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function backfillDependents(supabase: SupabaseAdmin): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "dependents",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from("dependents")
      .select(
        "id, name, name_enc, birth_year, birth_year_enc, annual_income, annual_income_enc",
      )
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`dependents fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      const input: Record<string, unknown> = {}
      if (row.name && !row.name_enc) input.name = row.name
      if (row.birth_year != null && !row.birth_year_enc) {
        input.birth_year = row.birth_year
      }
      if (row.annual_income != null && !row.annual_income_enc) {
        input.annual_income = row.annual_income
      }
      if (Object.keys(input).length === 0) {
        stat.skipped++
        continue
      }
      try {
        const patch = encodeDependentPiiPatch(input)
        const { error: upErr } = await supabase
          .from("dependents")
          .update(patch)
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`dependents ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[dependents] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function verifyCoverage(supabase: SupabaseAdmin): Promise<void> {
  console.log("\n--- Verification ---")
  const checks: Array<{ label: string; promise: PromiseLike<{ count: number | null }> }> = [
    {
      label: "profiles missing name_enc",
      promise: supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("name", "is", null)
        .is("name_enc", null),
    },
    {
      label: "profiles missing telegram_user_id_enc",
      promise: supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("telegram_user_id", "is", null)
        .is("telegram_user_id_enc", null),
    },
    {
      label: "households missing telegram_chat_id_enc",
      promise: supabase
        .from("households")
        .select("id", { count: "exact", head: true })
        .not("telegram_chat_id", "is", null)
        .is("telegram_chat_id_enc", null),
    },
    {
      label: "linked_telegram_accounts missing telegram_user_id_enc",
      promise: supabase
        .from("linked_telegram_accounts")
        .select("id", { count: "exact", head: true })
        .not("telegram_user_id", "is", null)
        .is("telegram_user_id_enc", null),
    },
    {
      label: "signup_codes missing telegram_username_enc",
      promise: supabase
        .from("signup_codes")
        .select("id", { count: "exact", head: true })
        .not("telegram_username", "is", null)
        .is("telegram_username_enc", null),
    },
    {
      label: "families missing name_enc",
      promise: supabase
        .from("families")
        .select("id", { count: "exact", head: true })
        .not("name", "is", null)
        .is("name_enc", null),
    },
    {
      label: "dependents missing name_enc",
      promise: supabase
        .from("dependents")
        .select("id", { count: "exact", head: true })
        .not("name", "is", null)
        .is("name_enc", null),
    },
  ]

  let totalGap = 0
  for (const check of checks) {
    const { count } = await check.promise
    const c = count ?? 0
    console.log(`${check.label}: ${c}`)
    totalGap += c
  }

  if (totalGap > 0) {
    console.error(
      "\n❌ Coverage incomplete. Investigate failures above before switching reads.",
    )
    process.exit(1)
  }
  console.log("\n✅ Coverage complete for all Phase 2 columns.")
}

async function main() {
  const supabase = createSupabaseAdmin()
  const stats: PhaseStat[] = []

  console.log("Backfilling profiles…")
  stats.push(await backfillProfiles(supabase))

  console.log("\nBackfilling households…")
  stats.push(await backfillHouseholds(supabase))

  console.log("\nBackfilling linked_telegram_accounts…")
  stats.push(await backfillLinkedTelegramAccounts(supabase))

  console.log("\nBackfilling signup_codes…")
  stats.push(await backfillSignupCodes(supabase))

  console.log("\nBackfilling families…")
  stats.push(await backfillFamilies(supabase))

  console.log("\nBackfilling dependents…")
  stats.push(await backfillDependents(supabase))

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
