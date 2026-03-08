# AGENTS.md

## Cursor Cloud specific instructions

**fdb-tracker** is a Next.js 16 app (App Router + Turbopack) with shadcn/ui v4, Tailwind CSS 4, and TypeScript 5.9. Supabase is used as the backend database.

### Available npm scripts

See `package.json` for the full list. Key commands:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000, Turbopack) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Build | `npm run build` |
| Format | `npm run format` |

### Notes

- The dev server uses Turbopack (`next dev --turbopack`) and supports hot reload out of the box.
- ESLint currently reports 1 warning for an unused `Geist` import in `app/layout.tsx`; this is pre-existing and not a blocker.
- There are no automated tests configured (no Jest, Vitest, or Playwright). Manual browser testing is the current approach.
- Dark mode can be toggled by pressing the `d` key on the homepage (handled by `next-themes` via the `ThemeProvider`).
- **`.env.local` is required for `npm run build` and `npm run dev`** — Supabase client init throws at module evaluation if `NEXT_PUBLIC_SUPABASE_URL` is missing. Copy `.env.local.example` to `.env.local` and fill in placeholder values at minimum.
- Next.js 16 emits a deprecation warning for `middleware.ts` ("use proxy instead"); middleware still works correctly.
- Zod v4 (^4.3.6) is installed. The API is largely compatible with v3 but `import { z } from "zod"` is the correct import style.
- Supabase types are in `lib/supabase/database.types.ts`. The `Database` type must include `Relationships` arrays for each table (required by `@supabase/supabase-js` v2.98+), otherwise queries resolve to `never`.
- `lib/supabase/server.ts` exports `createSupabaseAdmin()` (factory function). All server-side code calls this function to get a Supabase client instance.
- SQL migrations live in `supabase/migrations/`. The app does not require a local Supabase instance; it connects to a remote project via env vars in `.env.local` (see `.env.local.example`).
- If you need to clean build artifacts, delete `.next/` before running `npm run build` to avoid stale manifest errors.
- Dashboard (`/dashboard/*`) and Settings (`/settings/*`) routes live under the `app/(app)/` route group, which provides a shared sidebar layout. The `(app)` segment is a Next.js route group and does not appear in the URL.
- `middleware.ts` protects `/dashboard/:path*`, `/settings/:path*`, and `/onboarding/:path*`; unauthenticated requests are redirected to `/login`. When testing dashboard/settings pages locally, you'll get a 307 redirect unless you have a valid session cookie.
- `npm run build` may fail on pre-existing type errors in files outside your changes (e.g. `app/onboarding/income/page.tsx`). Use `npm run typecheck` for a clean type-only check that excludes the Next.js build pipeline.
