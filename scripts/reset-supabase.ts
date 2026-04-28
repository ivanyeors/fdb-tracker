#!/usr/bin/env npx tsx
/**
 * Clean reset of all Supabase public schema data.
 *
 * Truncates all tables (households, profiles, bank_accounts, investments, etc.)
 * via TRUNCATE ... CASCADE. Requires --force to prevent accidental runs.
 *
 * Usage:
 *   npm run db:reset -- --force
 *   npm run db:reset -- --force --dry-run
 *
 *   DATABASE_URL="postgresql://postgres.[ref]:[password]@..." npx tsx scripts/reset-supabase.ts --force
 *
 * Env: DATABASE_URL or SUPABASE_DB_URL (from Supabase Dashboard → Project Settings → Database)
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

const RESET_SQL = `TRUNCATE households, precious_metals_prices RESTART IDENTITY CASCADE;`

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
  }
}

function printUsage() {
  console.error("Supabase Clean Reset")
  console.error("")
  console.error("Deletes all users and data from the public schema.")
  console.error("")
  console.error("Usage:")
  console.error("  npm run db:reset -- --force")
  console.error("  npm run db:reset -- --force --dry-run   # Print SQL without executing")
  console.error("")
  console.error("Options:")
  console.error("  --force     Required. Prevents accidental runs.")
  console.error("  --dry-run   Print the SQL that would run, then exit.")
  console.error("")
  console.error("Env: DATABASE_URL or SUPABASE_DB_URL")
  console.error("     Get from: Supabase Dashboard → Project Settings → Database → Connection string (URI)")
}

async function main() {
  const { force, dryRun } = parseArgs()

  if (!force) {
    console.error("Error: --force is required to run the reset.")
    console.error("")
    printUsage()
    process.exit(1)
  }

  if (dryRun) {
    console.log("--dry-run: would execute:")
    console.log("")
    console.log(RESET_SQL)
    console.log("")
    console.log("Tables affected: households, precious_metals_prices (and all dependent tables via CASCADE)")
    return
  }

  const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL

  if (!dbUrl) {
    console.error("Error: DATABASE_URL or SUPABASE_DB_URL is not set.")
    console.error("")
    console.error("Get it from: Supabase Dashboard → Project Settings → Database → Connection string (URI)")
    process.exit(1)
  }

  const { default: postgres } = await import("postgres")
  const sql = postgres(dbUrl, { max: 1 })

  try {
    await sql.unsafe(RESET_SQL)
    console.log("✅ Supabase reset complete. All public schema data has been truncated.")
  } catch (err) {
    console.error("❌ Reset failed:", err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
