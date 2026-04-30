#!/usr/bin/env npx tsx
/**
 * Apply all SQL files in supabase/migrations/ in lexical order against a target Postgres URL.
 *
 * Usage:
 *   npm run db:migrate:test                  # uses TEST_DATABASE_URL from .env.test.local
 *   npx tsx scripts/migrate-supabase.ts --env=test
 *
 * Idempotent — every migration in this repo is written to be safe on re-run
 * (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, etc).
 *
 * Refuses to run against the dev/prod database: TEST_DATABASE_URL is required
 * and must contain "test" or "e2e".
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function parseArgs(): { env: "test"; clean: boolean } {
  const args = process.argv.slice(2)
  const envArg = args.find((a) => a.startsWith("--env="))?.split("=")[1]
  if (envArg !== "test") {
    console.error("Usage: migrate-supabase.ts --env=test [--clean]")
    process.exit(1)
  }
  return { env: envArg, clean: args.includes("--clean") }
}

function loadEnvLocal(filename: string) {
  const path = resolve(process.cwd(), filename)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = /^([^#=]+)=(.*)$/.exec(line)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replaceAll(/^["']|["']$/g, "")
    }
  }
}

async function main() {
  const { env, clean } = parseArgs()
  loadEnvLocal(".env.test.local")

  const dbUrl = process.env.TEST_DATABASE_URL
  if (!dbUrl) {
    console.error(
      `Error: TEST_DATABASE_URL must be set in .env.test.local for --env=${env}.`
    )
    console.error(
      "Get it from: Supabase Dashboard → Project Settings → Database → Connection string (URI)."
    )
    process.exit(1)
  }

  // Safety guard: refuse if test DB URL matches the prod DATABASE_URL in .env.local.
  loadEnvLocal(".env.local")
  const prodDbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL
  if (prodDbUrl && prodDbUrl.trim() === dbUrl.trim()) {
    console.error(
      "Refusing to migrate: TEST_DATABASE_URL matches DATABASE_URL in .env.local."
    )
    console.error("These must point to DIFFERENT Supabase projects.")
    process.exit(1)
  }

  const migrationsDir = resolve(process.cwd(), "supabase/migrations")
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  if (files.length === 0) {
    console.error("No .sql files found in supabase/migrations/")
    process.exit(1)
  }

  console.log(`Applying ${files.length} migrations to test DB...`)

  const { default: postgres } = await import("postgres")
  const sql = postgres(dbUrl, { max: 1 })

  try {
    if (clean) {
      console.log("--clean: resetting public schema...")
      await sql.unsafe(
        "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
      )
      // Restore Supabase's standard role grants so service_role / anon / authenticated can use the schema.
      await sql.unsafe(`
        GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
        GRANT ALL ON SCHEMA public TO postgres;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
        GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
      `)
      await sql.unsafe(
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;'
      )
    }

    for (const file of files) {
      // 061_platform_admin.sql expects a pre-existing household to mark as super admin.
      // In prod that household existed already; for the test DB we seed a stub first.
      if (file === "061_platform_admin.sql") {
        await sql.unsafe(`
          INSERT INTO households (id, user_count)
          VALUES ('8006c583-db27-4724-8ec2-63c5bc07ac3e', 2)
          ON CONFLICT (id) DO NOTHING;
        `)
      }

      const fullPath = resolve(migrationsDir, file)
      const text = readFileSync(fullPath, "utf-8").trim()
      if (!text) continue
      process.stdout.write(`  ${file} ... `)
      try {
        await sql.unsafe(text)
        console.log("ok")
      } catch (err) {
        console.log("FAILED")
        console.error(err)
        process.exit(1)
      }
    }
    console.log("✅ All migrations applied")
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
