# Supabase & Database Guide

Apply these conventions when designing schema, writing API routes, creating migrations, or fetching data.

## Client Usage

- **Server-side (API routes, server components):** `createSupabaseAdmin()` from `@/lib/supabase/server.ts`. Uses `SUPABASE_SERVICE_ROLE_KEY` (full permissions).
- **Client-side:** Supabase anon key via `@/lib/supabase/client.ts`. RLS enforced.
- Always select only needed columns: `.select('id, name, amount')` — avoid `select('*')`.
- Use `.single()` for single-row lookups, `.maybeSingle()` when the row may not exist.
- Prefer joins over N+1 queries.

## Schema Conventions

| Convention | Pattern |
|-----------|---------|
| Table names | `snake_case` |
| Primary keys | `id` (uuid, `gen_random_uuid()`) |
| Foreign keys | `{table}_id` |
| Timestamps | `created_at`, `updated_at` (timestamptz) |
| Profile scope | `profile_id` (uuid, nullable for combined records) |
| Family scope | `family_id` (uuid) |
| Household scope | `household_id` (uuid) |

## Types

- Auto-generated in `lib/supabase/database.types.ts`.
- The `Database` type must include `Relationships` arrays for each table (required by `@supabase/supabase-js` v2.98+), otherwise queries resolve to `never`.
- Import: `import { Database } from "@/lib/supabase/database.types"`

## Row-Level Security (RLS)

- Enabled on all tables.
- Policies scoped by `household_id` or `profile_id`.
- Server-side admin client bypasses RLS (service role key).
- Test policies with different roles when designing new tables.

## API Route Pattern

```ts
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

const bodySchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
})

export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("example")
    .insert({ ...parsed.data, household_id: session.accountId })
    .select()
    .single()

  if (error) {
    console.error("Insert failed:", error)
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

## Migrations

- SQL files in `supabase/migrations/`. Named `NNN_description.sql` (sequential numbering).
- Apply via: Supabase SQL Editor (paste & run) or `npx supabase db push`.
- After adding/modifying tables, regenerate types and update `database.types.ts`.
- Always enable RLS on new tables: `ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;`
- Add policies for SELECT, INSERT, UPDATE, DELETE as needed.

## Query Patterns

```ts
// Fetch with profile filter (nullable for combined)
const query = supabase.from("bank_accounts").select("*")
if (profileId) query.eq("profile_id", profileId)
else query.eq("family_id", familyId)

// Upsert pattern (PII columns must be encoded via the table's encoder)
const { error } = await supabase
  .from("income_config")
  .upsert(
    { profile_id: profileId, ...encodeIncomeConfigPiiPatch({ annual_salary: salary }) },
    { onConflict: "profile_id" }
  )

// Join pattern (select *_enc and decode in JS — plaintext columns were dropped in Phase 4)
const { data } = await supabase
  .from("profiles")
  .select("id, name, income_config(annual_salary_enc, bonus_estimate_enc)")
  .eq("family_id", familyId)
```
