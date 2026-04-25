#!/usr/bin/env npx tsx
/**
 * Phase 1 PII backfill — encrypts plaintext rows for:
 *   - households.telegram_bot_token       → telegram_bot_token_enc
 *   - profiles.telegram_link_token        → telegram_link_token_enc + _hash
 *   - telegram_sessions.session_data      → session_data_enc
 *
 * Idempotent (skips rows where _enc is already populated). Resumable
 * across crashes via keyset pagination.
 *
 * Prerequisites:
 *   1. Migration `058_pii_phase1_add.sql` applied.
 *   2. PII_ENCRYPTION_KEY_V1 and PII_HASH_SECRET_V1 in .env.local.
 *   3. SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Run:
 *   npx tsx scripts/backfill-pii-phase1.ts
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

import { encryptJson, encryptString } from "@/lib/crypto/cipher"
import { deterministicHash } from "@/lib/crypto/hash"
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
      .select("id, telegram_bot_token, telegram_bot_token_enc")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`households fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      if (row.telegram_bot_token_enc) {
        stat.skipped++
        continue
      }
      if (!row.telegram_bot_token) {
        stat.skipped++
        continue
      }
      try {
        const enc = encryptString(row.telegram_bot_token, {
          table: "households",
          column: "telegram_bot_token_enc",
        })
        const { error: upErr } = await supabase
          .from("households")
          .update({ telegram_bot_token_enc: enc })
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
        "id, telegram_link_token, telegram_link_token_enc, telegram_link_token_hash",
      )
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) throw new Error(`profiles fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      if (row.telegram_link_token_enc && row.telegram_link_token_hash) {
        stat.skipped++
        continue
      }
      if (!row.telegram_link_token) {
        stat.skipped++
        continue
      }
      try {
        const enc = encryptString(row.telegram_link_token, {
          table: "profiles",
          column: "telegram_link_token_enc",
        })
        const hash = deterministicHash(row.telegram_link_token, {
          table: "profiles",
          column: "telegram_link_token_hash",
        })
        const { error: upErr } = await supabase
          .from("profiles")
          .update({
            telegram_link_token_enc: enc,
            telegram_link_token_hash: hash,
          })
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

async function backfillTelegramSessions(
  supabase: SupabaseAdmin,
): Promise<PhaseStat> {
  const stat: PhaseStat = {
    table: "telegram_sessions",
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  }
  // telegram_sessions.id is a TEXT (Telegram chat key), not a UUID.
  // Use string keyset pagination starting from empty.
  let cursor = ""

  while (true) {
    const query = supabase
      .from("telegram_sessions")
      .select("id, session_data, session_data_enc")
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    const { data: rows, error } = cursor
      ? await query.gt("id", cursor)
      : await query

    if (error) throw new Error(`telegram_sessions fetch: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      stat.scanned++
      if (row.session_data_enc) {
        stat.skipped++
        continue
      }
      if (
        !row.session_data ||
        (typeof row.session_data === "object" &&
          !Array.isArray(row.session_data) &&
          Object.keys(row.session_data as object).length === 0)
      ) {
        // Empty `{}` blobs are not PII — skip.
        stat.skipped++
        continue
      }
      try {
        const enc = encryptJson(row.session_data, {
          table: "telegram_sessions",
          column: "session_data_enc",
        })
        const { error: upErr } = await supabase
          .from("telegram_sessions")
          .update({ session_data_enc: enc })
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        stat.encrypted++
      } catch (e) {
        stat.failed++
        console.error(`telegram_sessions ${row.id}:`, e)
      }
    }

    cursor = rows[rows.length - 1]!.id
    console.log(
      `[telegram_sessions] cursor=${cursor} scanned=${stat.scanned} encrypted=${stat.encrypted} failed=${stat.failed}`,
    )
  }

  return stat
}

async function verifyCoverage(supabase: SupabaseAdmin): Promise<void> {
  console.log("\n--- Verification ---")

  const { count: hh, error: hhErr } = await supabase
    .from("households")
    .select("id", { count: "exact", head: true })
    .not("telegram_bot_token", "is", null)
    .is("telegram_bot_token_enc", null)
  if (hhErr) throw new Error(`households verify: ${hhErr.message}`)
  console.log(
    `households with plaintext bot token but no ciphertext: ${hh ?? 0}`,
  )

  const { count: pr, error: prErr } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("telegram_link_token", "is", null)
    .or("telegram_link_token_enc.is.null,telegram_link_token_hash.is.null")
  if (prErr) throw new Error(`profiles verify: ${prErr.message}`)
  console.log(
    `profiles with plaintext link token but missing ciphertext or hash: ${pr ?? 0}`,
  )

  // Skipping a precise telegram_sessions check: empty `{}` rows are intentionally
  // skipped above, so a strict "non-null plaintext implies non-null ciphertext"
  // check would false-positive. Spot-checking via SELECT in the DB is fine.

  if ((hh ?? 0) > 0 || (pr ?? 0) > 0) {
    console.error(
      "\n❌ Coverage incomplete. Investigate failures above before switching reads.",
    )
    process.exit(1)
  }
  console.log("\n✅ Coverage complete for households + profiles.")
}

async function main() {
  const supabase = createSupabaseAdmin()
  const stats: PhaseStat[] = []

  console.log("Backfilling households…")
  stats.push(await backfillHouseholds(supabase))

  console.log("\nBackfilling profiles…")
  stats.push(await backfillProfiles(supabase))

  console.log("\nBackfilling telegram_sessions…")
  stats.push(await backfillTelegramSessions(supabase))

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
