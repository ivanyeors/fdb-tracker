#!/usr/bin/env npx tsx

import { readFileSync, existsSync } from "node:fs"
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

const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error("Error: DATABASE_URL or SUPABASE_DB_URL is not set.")
  process.exit(1)
}

async function main() {
  const { default: postgres } = await import("postgres")
  const sql = postgres(dbUrl as string, { max: 1 })

  const migrationPath = resolve(process.cwd(), "supabase/migrations/006_telegram_profile_link.sql")
  if (!existsSync(migrationPath)) {
    console.error("Migration file not found:", migrationPath)
    process.exit(1)
  }

  const migrationSql = readFileSync(migrationPath, "utf-8")
  const ddl = migrationSql.replace(/\nNOTIFY pgrst.*$/m, "")

  try {
    await sql.unsafe(ddl)
    await sql.unsafe("NOTIFY pgrst, 'reload schema'")
    console.log("✅ Migration applied successfully.")
  } catch (err) {
    console.error("❌ Migration failed:", err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
