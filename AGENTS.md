# AGENTS.md

## Cursor Cloud specific instructions

**fdb-tracker** is a Next.js 16 app (App Router + Turbopack) with shadcn/ui v4, Tailwind CSS 4, and TypeScript 5.9. Supabase is used as the backend database.

### Project Agent Skills (always consult)

For **every** task that touches this codebase, **read and follow** the relevant `SKILL.md` under [`.cursor/skills/`](.cursor/skills/) before writing or changing code. Match the task to the skill by its YAML `description` and folder name (e.g. UI work → `fdb-frontend`, date/calendar/range/month-year pickers → `fdb-date-calendars`, schema/API/Supabase → `fdb-supabase`, dollar amount forms → `fdb-money-inputs`). If multiple skills apply, read all of them. Do not skip skills in favor of guessing project conventions.

### Available npm scripts

See `package.json` for the full list. Key commands:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000, Turbopack) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Build | `npm run build` |
| Format | `npm run format` |
| Test | `npm test` (Vitest) |

### Notes

- The dev server uses Turbopack (`next dev --turbopack`) and supports hot reload out of the box.
- ESLint currently reports 1 warning for an unused `Geist` import in `app/layout.tsx`; this is pre-existing and not a blocker.
- **Vitest** is configured (`vitest.config.ts`, `globals: true`, `@` path alias). Run tests with `npm test` (`vitest run`). Test files live in `__tests__/calculations/`.
- **Charts:** Use **[visx](https://airbnb.io/visx/)** (`@visx/*`) only. Do **not** add or use **Recharts** (or other chart libraries) in this project.
- Dark mode can be toggled by pressing the `d` key on the homepage (handled by `next-themes` via the `ThemeProvider`).
- **`.env.local` is required for `npm run build` and `npm run dev`** — Supabase client init throws at module evaluation if `NEXT_PUBLIC_SUPABASE_URL` is missing. Ensure `.env.local` exists with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` at minimum.
- Next.js 16 emits a deprecation warning for `middleware.ts` ("use proxy instead"); middleware still works correctly.
- Zod v4 (^4.3.6) is installed. The API is largely compatible with v3 but `import { z } from "zod"` is the correct import style.
- Supabase types are in `lib/supabase/database.types.ts`. The `Database` type must include `Relationships` arrays for each table (required by `@supabase/supabase-js` v2.98+), otherwise queries resolve to `never`.
- `lib/supabase/server.ts` exports `createSupabaseAdmin()` (factory function). All server-side code calls this function to get a Supabase client instance.
- SQL migrations live in `supabase/migrations/`. The app does not require a local Supabase instance; it connects to a remote project via env vars in `.env.local`.
- If you need to clean build artifacts, delete `.next/` before running `npm run build` to avoid stale manifest errors. If the Turbopack dev server panics on start (e.g. "range start index … out of range"), deleting `.next/` and restarting resolves it.
- Dashboard (`/dashboard/*`) and Settings (`/settings/*`) routes live under the `app/(app)/` route group, which provides a shared sidebar layout. The `(app)` segment is a Next.js route group and does not appear in the URL.
- `middleware.ts` protects `/dashboard/:path*`, `/settings/:path*`, and `/onboarding/:path*`; unauthenticated requests are redirected to `/login`. When testing dashboard/settings pages locally, you'll get a 307 redirect unless you have a valid session cookie.
- The onboarding flow (`/onboarding/*`) uses an `OnboardingProvider` context that wraps the onboarding layout. All onboarding state (user count, profiles, income, banks, telegram, schedule) is held in React state; no Supabase calls are made during onboarding yet.

### Telegram Webhook Setup

The `/otp` command and other Telegram commands require the webhook URL to be registered with Telegram after deploying to production. Telegram only sends updates to the URL you set via `setWebhook`.

**Required env vars (Vercel):** `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (e.g. `https://fd-tracker-mu.vercel.app`), `CRON_SECRET`. For stock prices and search: `FMP_API_KEY` (Financial Modeling Prep). Optional for gold/silver fallback when OCBC API fails: `METALPRICEAPI_API_KEY` (metalpriceapi.com, free tier 100 req/month).

**Register webhook after deploy:**

1. **Via API route** (requires `CRON_SECRET` in Authorization header):
 ```bash
 curl -H "Authorization: Bearer $CRON_SECRET" "https://fd-tracker-mu.vercel.app/api/telegram/set-webhook"
 ```

2. **Via script** (from project root):
   ```bash
   NEXT_PUBLIC_APP_URL=https://fd-tracker-mu.vercel.app TELEGRAM_BOT_TOKEN=your_token npx tsx scripts/set-telegram-webhook.ts
   ```

3. **Manual curl**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://fd-tracker-mu.vercel.app/api/telegram/webhook"
   ```

**Check webhook status** (debugging):
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://fd-tracker-mu.vercel.app/api/telegram/webhook-info"
```

**Command menu** (shows when users tap "/" in the chat): The set-webhook API and script also register the bot command menu. To update only the menu without changing the webhook:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://fd-tracker-mu.vercel.app/api/telegram/set-commands"
```
The menu can take a few minutes to appear; restart the Telegram app if it does not show.

### Telegram /otp "Login is temporarily unavailable"

If `/otp` returns "❌ Login is temporarily unavailable" and Vercel logs show `Could not find the table 'public.households' in the schema cache`, the migrations were not applied to your Supabase project.

**Fix:**

1. **Supabase SQL Editor** (recommended): Open Supabase Dashboard → SQL Editor → New query. Paste and run the contents of `supabase/migrations/003_ensure_households.sql`.

2. **Script** (with database URL): Get the connection string from Supabase Dashboard → Project Settings → Database → Connection string (URI). Then:
   ```bash
   DATABASE_URL="postgresql://postgres.[ref]:[password]@..." npm run db:fix-households
   ```

3. **Supabase CLI**: If linked, run `npx supabase db push` to apply all migrations.

### "Error Loading Profiles" / profiles table not found

If the dashboard or settings show "Error Loading Profiles" and logs show `Could not find the table 'public.profiles' in the schema cache`, the `profiles` table was never created in your Supabase project.

**Fix:**

1. **Supabase SQL Editor** (recommended): Open Supabase Dashboard → SQL Editor → New query. Paste and run the contents of `supabase/migrations/004_ensure_profiles.sql`.

2. **Script** (with database URL): Get the connection string from Supabase Dashboard → Project Settings → Database → Connection string (URI). Then:
   ```bash
   DATABASE_URL="postgresql://postgres.[ref]:[password]@..." npm run db:fix-profiles
   ```

3. **Supabase CLI**: If linked, run `npx supabase db push` to apply all migrations.

**Note:** The `profiles` table depends on `households`. If you see both errors, run `003_ensure_households.sql` (or `npm run db:fix-households`) first, then apply the profiles migration.

### "Error Loading Profiles" / profiles-income_config relationship not found

If the settings users page shows "Error Loading Profiles" and logs show `Could not find a relationship between 'profiles' and 'income_config' in the schema cache`, the `income_config` table was never created in your Supabase project.

**Fix:**

1. **Supabase SQL Editor** (recommended): Open Supabase Dashboard → SQL Editor → New query. Paste and run the contents of `supabase/migrations/005_ensure_income_config.sql`.

2. **Script** (with database URL): Get the connection string from Supabase Dashboard → Project Settings → Database → Connection string (URI). Then:
   ```bash
   DATABASE_URL="postgresql://postgres.[ref]:[password]@..." npm run db:fix-income-config
   ```

3. **Supabase CLI**: If linked, run `npx supabase db push` to apply all migrations.

**Note:** The `income_config` table depends on `profiles`. Ensure `004_ensure_profiles.sql` (or `npm run db:fix-profiles`) has been applied first.

### "Failed to fetch account" / investment_accounts table not found

If `GET /api/investments/account` returns 500 and logs show `Could not find the table 'public.investment_accounts' in the schema cache`, the `investment_accounts` table was never created in your Supabase project.

**Fix:**

1. **Supabase SQL Editor** (recommended): Open Supabase Dashboard → SQL Editor → New query. Paste and run the contents of `supabase/migrations/012_investment_accounts.sql`.

2. **Supabase CLI**: If linked, run `npx supabase db push` to apply all migrations.

**Note:** The `investment_accounts` table depends on `families` and `profiles`. Ensure `008_add_families.sql` (and its dependencies) has been applied first.
