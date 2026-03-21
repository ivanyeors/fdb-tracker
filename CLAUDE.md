# fdb-tracker

Personal finance dashboard for Singapore households. Multi-user, multi-family support with Telegram bot integration.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5.9 (strict) |
| UI | React 19, shadcn/ui v4 (radix-nova, stone base), Tailwind CSS 4 |
| Database | Supabase (PostgreSQL), RLS enabled |
| Auth | Telegram OTP → JWT cookie (`fdb-session`) |
| Charts | visx (`@visx/*`) — **never use Recharts** |
| Validation | Zod v4 |
| Testing | Vitest (globals, node env) |
| Deployment | Vercel (cron jobs in `vercel.json`) |
| Bot | Telegraf (Telegram commands + scenes) |

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000, Turbopack) |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Test | `npm test` (Vitest) |
| Format | `npm run format` (Prettier) |

## Project Structure

```
app/
  (app)/              # Route group: dashboard + settings (shared sidebar layout)
    dashboard/        # /dashboard/* pages (overview, banks, cpf, investments, cashflow, goals, loans, tax, insurance)
    settings/         # /settings/* pages (setup, users, giro, notifications)
  api/                # REST API routes
  login/              # OTP login page
  onboarding/         # Multi-step onboarding wizard
components/
  ui/                 # shadcn/ui components + custom wrappers (currency-input, date-picker, info-tooltip)
  dashboard/          # Dashboard-specific components (metric-card, section-header)
  layout/             # Sidebar, chrome
  onboarding/         # Onboarding step components
  settings/           # Settings components
lib/
  api/                # Server-side data helpers (resolve-family, effective-inflow, net-liquid)
  auth/               # Session/JWT, OTP, API keys
  calculations/       # Financial math (CPF, tax, loans, bank interest, ILP, savings goals)
  supabase/           # Client (browser) + server (admin) creation, database.types.ts
  investments/        # Investment analytics, display currency
  external/           # External API integrations (Yahoo Finance, FMP, OCBC)
  telegram/           # Bot scenes, commands, handlers
  ilp-import/         # MHTML fund report parsing
  validations/        # Zod schemas
  tooltips.ts         # Centralized tooltip registry
  utils.ts            # cn(), formatCurrency()
hooks/
  use-active-profile.tsx  # ActiveProfileProvider context (profile/family state + localStorage)
__tests__/            # Vitest test files
supabase/migrations/  # PostgreSQL migration SQL files (28 migrations)
```

## Key Conventions

### Imports & Paths
- Path alias: `@/*` → project root. Always use `@/` imports, never relative.

### Components
- shadcn/ui primitives in `components/ui/`. App components in `components/`.
- **Adding shadcn components:** use `npx shadcn@latest add <component>` — do not manually copy.
- **Dollar amounts:** use `CurrencyInput` from `@/components/ui/currency-input` — never `<Input type="number">` for money.
- **Date pickers:** use project primitives (`DatePicker`, `MonthYearPicker`, `BirthDatePicker`, `DateRangePicker`, `ScheduleDatePicker`) from `components/ui/`. Never use `<input type="date">`.
- **Tooltips:** use `InfoTooltip` from `@/components/ui/info-tooltip`. Content registry in `lib/tooltips.ts`.
- **Toasts:** Sonner — `toast.success()` / `toast.error()` from `sonner`.
- **Charts:** visx only (`@visx/*`). No Recharts or other chart libraries.
- **Icons:** lucide-react.

### Formatting & Linting
- Prettier: no semicolons, double quotes, 2-space indent, trailing commas (es5), Tailwind plugin.
- ESLint: unused vars with `^_` prefix are allowed (warn, not error).
- Dark mode: `next-themes` with `ThemeProvider`. Toggle with `d` key on homepage.

### Page Patterns
- Dashboard pages live under `app/(app)/dashboard/`. The `(app)` route group provides the sidebar layout.
- Most pages show **Combined | Person A | Person B** tabs. Data filtered by `profileId` via `useActiveProfile()` context.
- Data fetching: `useEffect` + `useState` + `fetch('/api/...')` with `profileId`/`familyId` query params.
- Loading states: Skeleton components (see `MetricCard` pattern).
- Feedback: `toast.success()`/`toast.error()` after mutations.

## Database

- **Client:** `createSupabaseAdmin()` from `lib/supabase/server.ts` for all server-side code.
- **Types:** auto-generated in `lib/supabase/database.types.ts`. Must include `Relationships` arrays (required by `@supabase/supabase-js` v2.98+).
- **Naming:** `snake_case` tables/columns. PKs: `id` (uuid). FKs: `{table}_id`. Timestamps: `created_at`, `updated_at`.
- **RLS:** all tables have row-level security scoped by `household_id` or `profile_id`.
- **Migrations:** SQL files in `supabase/migrations/`. Apply via Supabase SQL Editor or `npx supabase db push`.

## Auth & Middleware

- Telegram OTP flow: request OTP → bot posts to channel → user enters on dashboard → JWT issued.
- Session: JWT cookie `fdb-session` (7-day expiry). Claims: `householdId` (mapped to `accountId`).
- `middleware.ts` protects `/dashboard/*`, `/settings/*`, `/onboarding/*`. Unauthenticated → `/login`.
- Onboarding: if `onboarding_completed_at` is null, redirect to `/onboarding`.

## API Route Pattern

```ts
// app/api/example/route.ts
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseAdmin()
  // Zod validate input, query Supabase, return NextResponse.json(data)
}
```

## Environment Variables

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`
**Optional:** `JWT_SECRET` (fallback: service role key), `FMP_API_KEY` (stock data), `METALPRICEAPI_API_KEY` (gold/silver fallback)

`.env.local` is required for `npm run build` and `npm run dev`.

## Testing

- Framework: Vitest with globals enabled (`vitest.config.ts`).
- Tests in `__tests__/` (calculations, auth, investments, ILP, OCBC, Telegram parsing).
- Run: `npm test`. Path alias `@` works in tests.

## Telegram Bot

- Webhook: `/api/telegram/webhook`. Register after deploy with `curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/telegram/set-webhook"`.
- Commands: `/otp`, `/in`, `/out`, `/goal`, `/buy`, `/sell`, `/repay`, `/ilp`, `/stock-img`.
- Scenes (multi-step): OTP, Inflow, Outflow, Buy, Sell, Goal Add, ILP, Link API.

## Common Issues

- **Build fails:** delete `.next/` and rebuild. Turbopack can leave stale manifests.
- **Missing tables:** apply migrations via Supabase SQL Editor or `npx supabase db push`. See `AGENTS.md` for table-specific fixes.
- **Middleware deprecation warning:** Next.js 16 warns about `middleware.ts` — it still works correctly.
- **ILP premium mode:** `one_time` products are excluded from recurring monthly totals. Use `premiums_paid` from entries for return calculations.

## Skill Commands

Use `/frontend`, `/supabase`, `/money-inputs`, `/date-pickers` for domain-specific guidance. Use `/new-page` or `/new-api-route` to scaffold new features.
