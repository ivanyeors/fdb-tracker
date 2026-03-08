---
name: fdb-supabase
description: Senior database engineer for fdb-tracker. Integrates Supabase backend with Next.js frontend seamlessly with optimized code. Use when designing schema, writing RLS, creating API routes, or implementing data fetching. Ensures type-safe client usage, efficient queries, and secure access patterns.
---

# FDB Tracker Supabase

Senior database engineer guidelines for seamless backend–frontend integration with Supabase. Use Supabase MCP when available for schema and migrations.

## When to Apply

- Designing or modifying database schema
- Writing Row-Level Security (RLS) policies
- Creating Next.js API routes that use Supabase
- Implementing data fetching (server or client)
- Optimizing queries or indexes
- Setting up Supabase client and auth

## Principles

1. **Seamless integration:** API routes and Server Components should use Supabase client consistently. Avoid mixing raw SQL with client calls unless necessary.
2. **Optimized code:** Use select(), single(), maybeSingle() to fetch only needed columns. Prefer joins over N+1 queries. Use indexes for filters and sorts.
3. **Type safety:** Generate and use TypeScript types from Supabase schema. Prefer `Database` type for tables.
4. **RLS first:** Design RLS so that a single Supabase client (with service role or anon + RLS) can serve all access patterns. No bypass unless explicitly required.

## Schema Conventions

- Tables: snake_case
- Primary keys: `id` (uuid, default gen_random_uuid())
- Foreign keys: `{table}_id`
- Timestamps: `created_at`, `updated_at` (timestamptz)
- Profile-scoped: `profile_id` (uuid, nullable for combined records)

## RLS Pattern

- Policies scoped by `profile_id` or shared access for combined data
- Use `auth.uid()` or session-based checks for multi-tenant isolation
- Test policies with different roles (anon, authenticated, service)

## Client Usage

```ts
// Prefer server-side Supabase client for API routes and RSC
import { createServerClient } from '@supabase/ssr'

// Select only needed columns
const { data } = await supabase
  .from('profiles')
  .select('id, name, birth_year')
  .eq('id', profileId)
  .single()
```

## API Route Pattern

- Validate input
- Use Supabase client (server)
- Return typed responses
- Handle errors consistently

## References

- **supabase-postgres-best-practices** skill — use when writing/optimizing Postgres queries, schema, RLS
- [Supabase Docs](https://supabase.com/docs)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
