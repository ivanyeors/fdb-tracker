#!/usr/bin/env npx tsx
/**
 * Applies the households migration to fix /otp "table not found" error.
 *
 * Option A - Supabase CLI (recommended):
 *   npx supabase link --project-ref <your-project-ref>
 *   npx supabase db push
 *
 * Option B - Run this script with DATABASE_URL:
 *   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" \
 *   npx tsx scripts/apply-households-migration.ts
 *
 * Option C - Run SQL manually in Supabase Dashboard → SQL Editor:
 *   Copy contents of supabase/migrations/003_ensure_households.sql
 */

import { readFileSync, existsSync } from "node:fs"
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

const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error("Error: DATABASE_URL or SUPABASE_DB_URL is not set.")
  console.error("")
  console.error("Get it from: Supabase Dashboard → Project Settings → Database → Connection string (URI)")
  console.error("")
  console.error("Or run the migration manually:")
  console.error("  1. Open Supabase Dashboard → SQL Editor")
  console.error("  2. Paste contents of supabase/migrations/003_ensure_households.sql")
  console.error("  3. Run the query")
  process.exit(1)
}

async function main() {
  const { default: postgres } = await import("postgres")
  const sql = postgres(dbUrl as string, { max: 1 })

  const migrationPath = resolve(process.cwd(), "supabase/migrations/003_ensure_households.sql")
  if (!existsSync(migrationPath)) {
    console.error("Migration file not found:", migrationPath)
    process.exit(1)
  }

  const migrationSql = readFileSync(migrationPath, "utf-8")
  // Remove NOTIFY - run separately after DDL
  const ddl = migrationSql.replace(/\nNOTIFY pgrst.*$/m, "")

  try {
    await sql.unsafe(ddl)
    await sql.unsafe("NOTIFY pgrst, 'reload schema'")
    console.log("✅ Migration applied successfully. households and otp_tokens tables are ready.")
  } catch (err) {
    console.error("❌ Migration failed:", err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
