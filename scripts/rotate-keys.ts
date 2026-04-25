#!/usr/bin/env npx tsx
/**
 * Re-encrypt every PII column whose ciphertext is not at CURRENT_KEY_VERSION.
 *
 * Idempotent: rows already at the target version (or null) are skipped, so the
 * script can be re-run after partial failures or to resume from interruption.
 * Resumable via id-keyset pagination.
 *
 * Usage:
 *   1. Add the new key version env vars (e.g. PII_ENCRYPTION_KEY_V2 +
 *      PII_HASH_SECRET_V2) AND keep the old ones (v1) configured. Both must
 *      be present so existing v1 ciphertext is decryptable while new writes
 *      are at v2.
 *   2. Set PII_CURRENT_KEY_VERSION=v2 so app + script target v2 for writes.
 *   3. Deploy the app first. Any new writes go to v2. Old reads still work.
 *   4. Run this script:  npx tsx scripts/rotate-keys.ts
 *   5. Verify zero rows remain at v1 across all listed columns. Then remove
 *      the v1 env vars from production.
 *
 * The script does NOT touch *_hash columns. Hashes are HMAC-SHA256 over a
 * normalized plaintext keyed by PII_HASH_SECRET_V1; rotating the hash secret
 * is a separate operation that requires re-deriving every hash on the way
 * in, which would also force every lookup site to recompute the comparison
 * value. Hash rotation is intentionally out of scope here.
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

import { decryptString, encryptString } from "@/lib/crypto/cipher"
import { CURRENT_KEY_VERSION } from "@/lib/crypto/keys"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const BATCH_SIZE = 500
const ZERO_UUID = "00000000-0000-0000-0000-000000000000"

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

interface ColumnSpec {
  table: string
  column: string
}

/**
 * Every encrypted column shipped by phases 1–5. Add new entries here when
 * later phases introduce more *_enc columns. The script treats every column
 * the same way — decrypt as bytes, re-encrypt as bytes — so number/JSON
 * columns don't need special handling.
 */
const COLUMNS: ColumnSpec[] = [
  // Phase 1 — credentials
  { table: "households", column: "telegram_bot_token_enc" },
  { table: "profiles", column: "telegram_link_token_enc" },
  { table: "telegram_sessions", column: "session_data_enc" },
  // Phase 2 — identity
  { table: "households", column: "telegram_chat_id_enc" },
  { table: "families", column: "name_enc" },
  { table: "profiles", column: "name_enc" },
  { table: "profiles", column: "birth_year_enc" },
  { table: "profiles", column: "telegram_user_id_enc" },
  { table: "profiles", column: "telegram_username_enc" },
  { table: "profiles", column: "telegram_chat_id_enc" },
  { table: "linked_telegram_accounts", column: "telegram_user_id_enc" },
  { table: "linked_telegram_accounts", column: "telegram_username_enc" },
  { table: "linked_telegram_accounts", column: "telegram_chat_id_enc" },
  { table: "signup_codes", column: "telegram_username_enc" },
  { table: "signup_codes", column: "used_by_telegram_user_id_enc" },
  { table: "dependents", column: "name_enc" },
  { table: "dependents", column: "birth_year_enc" },
  { table: "dependents", column: "annual_income_enc" },
  // Phase 3 — financial accounts
  { table: "bank_accounts", column: "account_number_enc" },
  { table: "loans", column: "lender_enc" },
  { table: "loans", column: "principal_enc" },
  // Phase 5 — audit log
  { table: "telegram_commands", column: "raw_message_enc" },
  { table: "telegram_commands", column: "args_enc" },
]

interface ColumnStat {
  table: string
  column: string
  scanned: number
  rotated: number
  alreadyAtTarget: number
  empty: number
  failed: number
}

const TARGET_PREFIX = `${CURRENT_KEY_VERSION}:`

async function rotateColumn(
  supabase: SupabaseAdmin,
  spec: ColumnSpec,
): Promise<ColumnStat> {
  const stat: ColumnStat = {
    table: spec.table,
    column: spec.column,
    scanned: 0,
    rotated: 0,
    alreadyAtTarget: 0,
    empty: 0,
    failed: 0,
  }
  let cursor = ZERO_UUID

  while (true) {
    const { data: rows, error } = await supabase
      .from(spec.table as never)
      .select(`id, ${spec.column}`)
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE)

    if (error) {
      throw new Error(`${spec.table}.${spec.column} fetch: ${error.message}`)
    }
    if (!rows || rows.length === 0) break

    for (const row of rows as Array<Record<string, unknown>>) {
      stat.scanned++
      const blob = row[spec.column] as string | null
      if (!blob) {
        stat.empty++
        continue
      }
      if (blob.startsWith(TARGET_PREFIX)) {
        stat.alreadyAtTarget++
        continue
      }
      try {
        const plaintext = decryptString(blob, {
          table: spec.table,
          column: spec.column,
        })
        const reEncrypted = encryptString(plaintext, {
          table: spec.table,
          column: spec.column,
        })
        const { error: upErr } = await supabase
          .from(spec.table as never)
          .update({ [spec.column]: reEncrypted } as never)
          .eq("id", row.id as string)
        if (upErr) throw new Error(upErr.message)
        stat.rotated++
      } catch (e) {
        stat.failed++
        console.error(
          `[${spec.table}.${spec.column}] row ${String(row.id)}:`,
          e,
        )
      }
    }

    cursor = (rows[rows.length - 1] as { id: string }).id
    console.log(
      `[${spec.table}.${spec.column}] cursor=${cursor} scanned=${stat.scanned} rotated=${stat.rotated} failed=${stat.failed}`,
    )
  }

  return stat
}

async function main() {
  console.log(
    `Rotating ciphertext to ${CURRENT_KEY_VERSION}. Old-version rows will be re-encrypted in place.\n`,
  )

  const supabase = createSupabaseAdmin()
  const stats: ColumnStat[] = []

  for (const spec of COLUMNS) {
    console.log(`\n→ ${spec.table}.${spec.column}`)
    stats.push(await rotateColumn(supabase, spec))
  }

  console.log("\n--- Summary ---")
  for (const s of stats) {
    console.log(
      `${s.table}.${s.column}: scanned=${s.scanned} rotated=${s.rotated} already=${s.alreadyAtTarget} empty=${s.empty} failed=${s.failed}`,
    )
  }

  const totalFailed = stats.reduce((acc, s) => acc + s.failed, 0)
  const totalRotated = stats.reduce((acc, s) => acc + s.rotated, 0)
  if (totalFailed > 0) {
    console.error(`\n❌ ${totalFailed} row(s) failed. See errors above.`)
    process.exit(1)
  }
  console.log(
    `\n✅ Rotation complete. ${totalRotated} ciphertext(s) re-encrypted to ${CURRENT_KEY_VERSION}.`,
  )
}

main().catch((err) => {
  console.error("Rotation failed:", err)
  process.exit(1)
})
