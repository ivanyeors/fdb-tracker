# fdb-tracker

Personal finance dashboard for Singapore households. Multi-user, multi-family support with Telegram bot integration.

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A Telegram bot (created via [@BotFather](https://t.me/BotFather))

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployed app URL (e.g. `https://fdb.example.com`) |
| `CRON_SECRET` | Yes | Bearer token for admin/cron endpoints |
| `TELEGRAM_WEBHOOK_SECRET` | Recommended | Secret token for Telegram webhook verification |
| `JWT_SECRET` | No | JWT signing key (falls back to service role key) |
| `FMP_API_KEY` | No | Financial Modeling Prep API key (stock data) |

### Installation

```bash
npm install
npm run dev
```

### Register the Telegram Webhook

After deploying (or using a tunnel like ngrok for local dev):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$NEXT_PUBLIC_APP_URL/api/telegram/set-webhook"
```

This registers the webhook URL with Telegram and sets bot commands. If `TELEGRAM_WEBHOOK_SECRET` is configured, it also registers a secret token so Telegram signs every request — the webhook endpoint will reject unsigned requests.

---

## Authentication & Signup

All authentication flows through your Telegram bot. There is no email/password. This keeps the system simple and ties every account to a verified Telegram identity.

### How It Works (Security Model)

1. **Identity = Telegram user ID.** Every account is anchored to the numeric Telegram user ID (`from.id`), which is immutable and assigned by Telegram. No passwords are stored.
2. **OTP is the bridge to the web dashboard.** A 6-digit code, SHA-256 hashed at rest, expires in 5 minutes, and is single-use.
3. **Sessions are HTTP-only JWT cookies** (`fdb-session`, 7-day expiry). The JWT contains only the `householdId` claim — no PII.
4. **Webhook verification.** When `TELEGRAM_WEBHOOK_SECRET` is set, every incoming update is checked against the `X-Telegram-Bot-Api-Secret-Token` header. Unsigned requests are rejected with 401.
5. **Data isolation.** Every query is scoped by `household_id`, `family_id`, or `profile_id`. Public bot users get their own isolated household — they can never see another user's data.

### For Public Bot Users (Telegram-only)

Public users interact entirely through the Telegram bot. No web login required.

```
Step 1 — Start the bot
   Open your Telegram bot and send /start.
   The bot auto-provisions your account:
     - A household (type: public) is created
     - A family ("Personal") is created under it
     - A profile is created using your Telegram first name
   You receive a welcome message listing available commands.

Step 2 — Start tracking
   Use any command immediately:
     /in 5000          — Record monthly income
     /out 3200 rent    — Record monthly expenses
     /buy              — Record a stock purchase (guided wizard)
     /sell             — Record a stock sale
     /goaladd          — Add to a savings goal
     /repay            — Log a loan repayment

Step 3 — Your data is yours
   All data is scoped to your Telegram user ID.
   No other user can access your records.
   The bot stores: your Telegram user ID, chat ID, and username
   (for resolving your account on subsequent messages).
```

### For Owner/Dashboard Users

Owner users get full web dashboard access via Telegram OTP login.

```
Step 1 — Create your account
   Open your Telegram bot and send /start.
   The bot creates your household and shows setup commands.

Step 2 — Get an OTP for web login
   Send /otp to the bot.
   The bot replies with a 6-digit code (e.g. 482917).
   This code:
     - Is SHA-256 hashed before storage (plaintext is never saved)
     - Expires in 5 minutes
     - Can only be used once

Step 3 — Log in on the web dashboard
   Go to https://<your-app-url>/login.
   Enter the 6-digit OTP.
   On success:
     - A JWT session cookie (fdb-session) is set (HTTP-only, 7-day expiry)
     - You are redirected to /onboarding (first time) or /dashboard

Step 4 — Complete onboarding (first time only)
   The onboarding wizard walks you through:
     1. Number of household members
     2. Profile names and birth years
     3. Income configuration
     4. CPF balances
     5. Bank accounts
     6. Telegram chat ID (for bot reminders)
     7. Reminder schedule
     8. (Optional) Investments, loans, insurance, tax reliefs
   After completion, you land on the dashboard.

Step 5 — Link additional family members (optional)
   In Settings > Setup, generate an API key.
   Share the key with a family member.
   They send /link <key> or /auth <key> to the bot.
   Their Telegram account is linked to your household,
   giving them bot access to shared family data.
```

### Logging Out

- **Web:** Click your avatar > Log out. The `fdb-session` cookie is cleared.
- **Bot:** No logout needed. The bot identifies you by Telegram user ID on every message.

### Security Checklist

| Concern | How it's handled |
|---------|-----------------|
| OTP brute force | Codes expire in 5 min, single-use, hashed at rest |
| Webhook spoofing | `TELEGRAM_WEBHOOK_SECRET` header verification (rejects unsigned requests) |
| Session hijacking | HTTP-only cookie, JWT with expiry, no PII in claims |
| Cross-tenant data access | All DB queries scoped by household/family/profile ID |
| Input injection (XSS) | All bot text inputs sanitized (HTML-encoded, control chars stripped) |
| API key exposure | Keys are SHA-256 hashed; only the prefix is stored for display |
| Bot token security | Token is server-side only (`TELEGRAM_BOT_TOKEN` never exposed to client) |

---

## Development

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000, Turbopack) |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Test | `npm test` |
| Format | `npm run format` |

## Tech Stack

Next.js 16 (App Router) / TypeScript / React 19 / shadcn/ui / Tailwind CSS 4 / Supabase (PostgreSQL) / Telegraf / visx charts / Zod / Vitest
