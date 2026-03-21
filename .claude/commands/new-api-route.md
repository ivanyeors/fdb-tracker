# Scaffold a New API Route

Use this guide when creating a new API endpoint.

## Steps

1. **Create the route file** at `app/api/<name>/route.ts`
2. **Follow the standard pattern** below
3. **Add Zod validation** for request body/params
4. **Test** with the dev server or Vitest

## Route Template

```ts
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

// Define request schema
const createSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  profileId: z.string().uuid().nullable(),
})

// GET - List/read
export async function GET(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const profileId = searchParams.get("profileId")
  const familyId = searchParams.get("familyId")

  const supabase = createSupabaseAdmin()
  let query = supabase.from("your_table").select("id, name, amount, profile_id")

  if (profileId) {
    query = query.eq("profile_id", profileId)
  } else if (familyId) {
    query = query.eq("family_id", familyId)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    console.error("Fetch failed:", error)
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST - Create
export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from("your_table")
    .insert({
      ...parsed.data,
      household_id: session.accountId,
    })
    .select()
    .single()

  if (error) {
    console.error("Insert failed:", error)
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

## Dynamic Routes

For routes with an ID parameter, create `app/api/<name>/[id]/route.ts`:

```ts
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ... validate session, parse body, update by id
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ... validate session, delete by id
}
```

## Checklist

- [ ] Route file created under `app/api/<name>/route.ts`
- [ ] Session validated via `validateSession` + `COOKIE_NAME` cookie
- [ ] Request body validated with Zod `safeParse`
- [ ] Uses `createSupabaseAdmin()` for database access
- [ ] Returns proper status codes (401, 400, 500, 200)
- [ ] Errors logged to console and returned as JSON
- [ ] Query scoped by `household_id`, `family_id`, or `profile_id`
