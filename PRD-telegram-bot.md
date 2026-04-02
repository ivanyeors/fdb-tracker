# PRD: Telegram Bot Platform — Conversational Data Entry & Notification System

> **Purpose:** This PRD documents a production-tested Telegram bot platform built as a companion interface to a web dashboard. It is written in two layers: **Core Platform** (reusable across any product) and **Reference Implementation** (personal finance domain). Take the core platform sections and adapt the domain-specific parts to your product.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Platform Architecture](#2-core-platform-architecture)
3. [Authentication & User Linking](#3-authentication--user-linking)
4. [Conversational Wizard Framework](#4-conversational-wizard-framework)
5. [Command Reference](#5-command-reference)
6. [Document Processing Pipeline](#6-document-processing-pipeline)
7. [Scheduled Notifications](#7-scheduled-notifications)
8. [Data Mutation Patterns](#8-data-mutation-patterns)
9. [Security & Input Handling](#9-security--input-handling)
10. [Database Schema (Bot Infrastructure)](#10-database-schema-bot-infrastructure)
11. [UX Patterns & Design Language](#11-ux-patterns--design-language)
12. [Reference Implementation: Personal Finance](#appendix-a-reference-implementation-personal-finance)

---

## 1. Product Overview

### 1.1 What This Is

A Telegram bot that serves as a **conversational data entry interface** for a web application. Users interact with the bot to record data, upload documents, and receive scheduled reminders — all synced to the same database that powers the web dashboard.

### 1.2 Why Telegram

| Advantage | Detail |
|-----------|--------|
| **Zero-friction data entry** | Users record data in 2-3 messages instead of navigating a web UI |
| **Mobile-first by default** | Telegram is already on the user's phone; no app to build or install |
| **Push notifications built-in** | Scheduled reminders arrive as chat messages — no push infrastructure needed |
| **Document upload** | Users can forward PDFs, images, and files directly to the bot |
| **Multi-user** | One bot serves all accounts; user identity resolved per message |
| **Always available** | Works offline-first from the user's perspective (messages queue until delivered) |

### 1.3 Core Capabilities

The platform provides **6 core capabilities** that are product-agnostic:

| # | Capability | Description |
|---|-----------|-------------|
| 1 | **Authentication & Linking** | Connect Telegram users to web app accounts via OTP, API keys, or profile tokens |
| 2 | **Conversational Wizards** | Multi-step data collection flows with inline keyboards, validation, editing, and confirmation |
| 3 | **One-Line Shortcuts** | Parse structured data from a single message (e.g., `/command 500 note text`) |
| 4 | **Document Processing** | Upload → parse → classify → extract → confirm → save pipeline for PDFs |
| 5 | **Scheduled Notifications** | Timezone-aware cron-based reminders with templated messages |
| 6 | **Cross-Prompt Suggestions** | After completing one action, suggest related actions via inline buttons |

### 1.4 User Types

| Type | Description | Access |
|------|-------------|--------|
| **Owner** | Has a web dashboard account; links Telegram for convenience | Full access: all commands + auth commands |
| **Public** | Telegram-only user; auto-provisioned on first message | Data entry commands only; no auth commands |

---

## 2. Core Platform Architecture

### 2.1 Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Bot framework | Telegraf.js (TypeScript) | Telegram Bot API wrapper with middleware, scenes, sessions |
| Hosting | Next.js API route (serverless) | Webhook endpoint — no long-running process needed |
| Session store | PostgreSQL (JSONB column) | Persist wizard state across webhook requests |
| Database | PostgreSQL (Supabase) | All application data |
| Cron | External cron service (Vercel Cron) | Trigger scheduled notification endpoint |

### 2.2 System Architecture

```
┌─────────────┐     HTTPS POST      ┌──────────────────┐
│  Telegram    │ ──────────────────► │  /api/telegram/   │
│  Servers     │                     │  webhook          │
└─────────────┘                     └────────┬─────────┘
                                             │
                                    ┌────────▼─────────┐
                                    │  Bot Instance     │
                                    │  (Singleton)      │
                                    └────────┬─────────┘
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                     ┌────────▼───┐  ┌───────▼────┐  ┌─────▼──────┐
                     │  Session   │  │  Command   │  │  Scene     │
                     │  Store     │  │  Handlers  │  │  (Wizard)  │
                     │  (DB)      │  │            │  │  Stage     │
                     └────────────┘  └────────────┘  └────────────┘
                                             │
                                    ┌────────▼─────────┐
                                    │  PostgreSQL      │
                                    │  (Supabase)      │
                                    └──────────────────┘

┌─────────────┐     HTTP GET         ┌──────────────────┐
│  Cron        │ ──────────────────► │  /api/cron/       │
│  Service     │                     │  reminders        │
└─────────────┘                     └────────┬─────────┘
                                             │
                                    ┌────────▼─────────┐
                                    │  Telegram API    │
                                    │  sendMessage()   │
                                    └──────────────────┘
```

### 2.3 Bot Initialization

The bot uses a **lazy singleton** pattern — one instance created on first webhook request, reused for all subsequent requests within the same serverless container.

```
getBot()
  ├─ If cached → return existing instance
  └─ Else → new Telegraf(token, { handlerTimeout: 90_000, webhookReply: false })
           → cache and return
```

**Key config:**
- `webhookReply: false` — never reply inline in the webhook response; always use explicit `ctx.reply()`
- `handlerTimeout: 90_000` — 90-second timeout for long operations (PDF parsing)

### 2.4 Middleware Stack

Middleware executes in registration order on every incoming update:

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | `session()` | Load/save session from DB before/after handler |
| 2 | `Stage` | Route updates to active wizard scenes |
| 3 | `cancelMiddleware` | Intercept `/cancel` globally to exit any scene |
| 4 | Command handlers | Match `/command` patterns to handlers |
| 5 | Message handlers | Match document uploads, photos, text |
| 6 | Error handler | Catch-all for unhandled errors |

### 2.5 Webhook Endpoint

```
POST /api/telegram/webhook
  ├─ Validate secret token header (x-telegram-bot-api-secret-token)
  ├─ Parse JSON body as Telegram Update
  ├─ ensureHandlers() — register scenes + commands once per cold start
  └─ bot.handleUpdate(update)
```

**Supporting endpoints:**

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/telegram/set-webhook` | GET | Bearer token | Register webhook URL with Telegram |
| `/api/telegram/set-commands` | GET | Bearer token | Push command menu to Telegram |
| `/api/telegram/webhook-info` | GET | Bearer token | Check webhook status |
| `/api/telegram/test-connection` | POST | None | Send test message to a chat ID |

### 2.6 Handler Registration

All scenes and commands are registered **once** per serverless cold start via a guard flag:

```
ensureHandlers(bot):
  if (handlersRegistered) return
  
  scenes = [scene1, scene2, ..., sceneN]
  stage = new Stage(scenes)
  
  stage.use(cancelMiddleware)
  bot.use(session(store))
  bot.use(stage.middleware())
  
  // Register command → scene mappings
  bot.command("cmd1", (ctx) => ctx.scene.enter("scene1"))
  bot.command("cmd2", (ctx) => ctx.scene.enter("scene2"))
  
  // Register message type handlers
  bot.on("document", handleDocument)
  bot.on("photo", handlePhoto)
  
  bot.catch(errorHandler)
  handlersRegistered = true
```

---

## 3. Authentication & User Linking

### 3.1 Overview

The bot supports **3 linking methods** to connect a Telegram user to a web app account, plus **auto-provisioning** for new users.

```
┌──────────────────────────────────────────────────────────┐
│                    User Resolution                        │
│                                                          │
│  1. Check profiles.telegram_user_id  ──► Direct link     │
│  2. Check linked_accounts.telegram_user_id ──► API key   │
│  3. Check profiles.telegram_username ──► Username match   │
│  4. Auto-provision new public account                    │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Method 1: OTP (One-Time Password)

**Use case:** Web dashboard user wants to log in from a new browser.

**Flow:**
1. User sends `/otp` to bot
2. Bot asks for Telegram username (if not already linked)
3. Bot looks up account by username
4. Bot generates 6-character OTP, stores hash in `otp_tokens` table (5-min expiry)
5. Bot sends OTP in chat message
6. User enters OTP on web login page
7. Web app verifies hash, issues JWT session cookie

**Requirements:**
- OTP must be short-lived (5 minutes)
- Store only the hash, never plaintext
- Rate limit OTP generation (implied by Telegram's own rate limits)

### 3.3 Method 2: API Key Linking

**Use case:** Account owner shares an API key so family members can link their Telegram accounts.

**Flow:**
1. Owner generates API key in web dashboard Settings
2. Owner shares key with family member
3. Family member sends `/auth` to bot, pastes API key
4. Bot validates key (format check → hash lookup → member count check)
5. Bot shows confirmation with user details
6. On confirm, bot creates `linked_telegram_accounts` record

**Requirements:**
- API key format: prefix + random hex (e.g., `fdb_` + 32 hex chars)
- Keys stored as SHA-256 hashes only
- Configurable `max_members` per key to limit sharing
- Upsert on `(api_key_id, telegram_user_id)` to allow re-linking

### 3.4 Method 3: Profile Token Linking

**Use case:** Account owner generates a one-time link token for a specific profile.

**Flow:**
1. Owner generates link token in web dashboard (UUID stored on profile)
2. Owner shares token with the person
3. Person sends `/link` to bot, pastes UUID token
4. Bot looks up profile by `telegram_link_token` column
5. Bot updates profile with Telegram IDs (user_id, chat_id, username)
6. Token is consumed (optionally cleared after use)

**Requirements:**
- Token is a UUID, single-use
- Directly links to a specific profile (not just the account)
- Updates profile-level Telegram fields for direct resolution

### 3.5 Auto-Provisioning (Public Users)

**Use case:** Someone messages the bot without any existing account.

**Flow:**
1. Unknown user sends any command (or `/start`)
2. Bot creates: Account → Organization → Profile
3. Profile populated with Telegram name, username, IDs
4. User can immediately use data entry commands
5. Account type set to `"public"` (limited permissions)

**Requirements:**
- Seamless — no sign-up form, no friction
- Account type distinguishes public (Telegram-only) from owner (web dashboard)
- Public users can later upgrade to owner by completing web onboarding

### 3.6 User Resolution Priority

On every incoming message, resolve the user in this order:

1. **Profile match** — `profiles.telegram_user_id` or `profiles.telegram_chat_id`
2. **Linked account match** — `linked_telegram_accounts.telegram_user_id` (most recent)
3. **Username match** — `profiles.telegram_username` (case-insensitive)
4. **Auto-provision** — Create new public account (if allowed for the command)

This resolution returns: `{ accountId, organizationId, profileId, accountType }` — the context needed for all subsequent operations.

---

## 4. Conversational Wizard Framework

### 4.1 Overview

Every data entry command is implemented as a **wizard scene** — a stateful, multi-step conversation flow. The framework provides:

- Sequential step progression
- Inline keyboard buttons for selections
- Free-text input with validation
- Edit-before-confirm flow
- Session persistence across webhook requests
- Global `/cancel` to exit any scene

### 4.2 Wizard Anatomy

Every wizard follows this structure:

```
┌─────────────────────────────────────────────┐
│              WIZARD SCENE                    │
│                                             │
│  Step 0: Context Selection                  │
│    └─ Select profile / entity               │
│       (auto-skip if only 1 option)          │
│                                             │
│  Step 1..N: Data Collection                 │
│    └─ Prompt → Validate → Store in session  │
│       (inline keyboards OR text input)      │
│                                             │
│  Step N+1: Confirmation                     │
│    └─ Show summary → [Confirm] [Cancel]     │
│       [Edit Field1] [Edit Field2] ...       │
│                                             │
│  On Confirm: Execute mutation → Leave scene │
│  On Edit: Jump back to step → Return here   │
│  On Cancel: Leave scene                     │
└─────────────────────────────────────────────┘
```

### 4.3 Session State

Each wizard stores its collected data in the session object, persisted to the database between webhook requests:

```typescript
interface WizardSession {
  // Wizard framework
  cursor: number              // Current step index
  editingField?: string       // Field being edited (if in edit flow)
  
  // Context
  profileId?: string
  profileName?: string
  organizationId?: string
  
  // Collected data (domain-specific)
  amount?: number
  month?: string              // "yyyy-MM-dd" (start of month)
  monthLabel?: string         // "March 2026" (display)
  memo?: string
  entityId?: string           // Selected entity (goal, loan, product, etc.)
  entityName?: string
  // ... additional fields per wizard
}
```

### 4.4 Step Types

#### A. Entity Selection Step

Shows inline keyboard buttons for selecting from a list (profiles, goals, loans, products, etc.).

**Behavior:**
- Fetch list from database
- If 1 item → auto-select, skip to next step
- If multiple → show as buttons (max ~20, truncate names for 64-byte callback limit)
- Callback data format: `{prefix}_{id}` or `{prefix}_{id}_{name}`

**Example keyboard:**
```
[ Profile: Alice ]  [ Profile: Bob ]
```

#### B. Amount Input Step

Prompt for a numeric value with optional quick-amount buttons.

**Behavior:**
- Show prompt with optional quick-amount keyboard (e.g., $100, $500, $1000)
- Accept text input: parse with regex `/^\s*([0-9]+(?:\.[0-9]+)?)\s*([\s\S]*)$/`
- Validate: must be positive number
- Optionally capture trailing text as memo/note

**Example keyboard:**
```
[ $100 ]  [ $500 ]  [ $1,000 ]
```

#### C. Month Picker Step

Show a grid of recent months as inline buttons.

**Behavior:**
- Generate 6 months: current month + 5 previous
- Layout: 3 columns × 2 rows
- Callback data: `m_{yyyy-MM-dd}` (start of month)
- Auto-set to current month as default

**Example keyboard:**
```
[ Mar 2026 ]  [ Feb 2026 ]  [ Jan 2026 ]
[ Dec 2025 ]  [ Nov 2025 ]  [ Oct 2025 ]
```

#### D. Text Input Step

Free-text entry with optional skip.

**Behavior:**
- Accept any text up to 2000 characters
- Sanitize: strip control chars, HTML-encode special chars
- Support `/skip` to leave blank
- Validate if required

#### E. Confirmation Step

Show collected data summary with confirm/cancel/edit buttons.

**Behavior:**
- Display formatted summary of all collected fields
- Inline keyboard: `[✅ Confirm] [❌ Cancel]` + edit buttons per field
- On confirm → execute mutation → leave scene
- On cancel → leave scene
- On edit → set `editingField`, jump to that step's index

**Example keyboard:**
```
[ ✅ Confirm ]  [ ❌ Cancel ]
[ ✏️ Month ]  [ ✏️ Amount ]  [ ✏️ Note ]
```

### 4.5 Edit Flow (Return-to-Confirmation)

When a user taps an edit button on the confirmation screen:

```
Confirmation → Edit button pressed
  └─ Set session.editingField = "fieldName"
  └─ Jump to the step that collects that field
  └─ User enters new value
  └─ advanceOrReturn():
       if editingField is set → clear it → jump back to confirmation
       else → advance to next step normally
```

This allows users to fix any field without re-entering everything.

### 4.6 One-Line Shortcuts

Some commands support parsing all data from a single message:

```
/command [ProfileName] <amount> [memo text]
```

**Parsing algorithm:**
1. Extract text after command (`rest`)
2. Try to match profile name (longest match first, case-insensitive prefix)
3. Parse amount from remaining text (first number)
4. Everything after the amount is the memo
5. If all required fields parsed → skip wizard, save directly

**Fallback:** If parsing fails or data is incomplete, enter the full wizard flow.

### 4.7 Cross-Prompt Suggestions

After completing a mutation, the bot can suggest a related action:

```
✅ Inflow of $5,000 saved for March 2026.

[ 📝 Log outflow for March? ]  [ Skip ]
```

**Implementation:**
- After successful save, send a new message with inline buttons
- Callback data encodes the next command + pre-filled context
- If user taps → enter the related scene with pre-filled session data
- If user taps Skip → dismiss

---

## 5. Command Reference

### 5.1 System Commands

| Command | Category | Auth Required | Description |
|---------|----------|---------------|-------------|
| `/start` | System | None | Welcome message; auto-provision public account if new user |
| `/cancel` | System | None | Exit any active wizard scene |
| `/otp` | Auth | Owner | Generate one-time password for web login |
| `/auth` | Auth | Owner | Link Telegram account via API key |
| `/link` | Auth | Owner | Link to specific profile via token or API key |

### 5.2 Data Entry Commands (Domain-Specific)

These are the domain-specific commands from the reference implementation. **Replace with your domain's data entry needs.**

| Command | Wizard Steps | Data Collected | One-Line Support |
|---------|-------------|----------------|------------------|
| `/in` | Profile → Month → Amount → Memo | Monthly income | ✅ `/in 5000 salary` |
| `/out` | Profile → Month → Amount → Memo | Monthly expense | ✅ `/out 2000 rent` |
| `/buy` | Profile → Symbol → Qty → Price → Note | Stock purchase | ❌ |
| `/sell` | Profile → Symbol → Qty → Price → Note | Stock sale | ❌ |
| `/ilp` | Product → Month → Value | Fund value update | ❌ |
| `/goaladd` | Goal → Amount | Goal contribution | ❌ |
| `/repay` | Loan → Amount | Loan repayment | ❌ |
| `/earlyrepay` | Loan → Amount | Early loan repayment | ❌ |
| `/stockimg` | Symbol → Photo | Screenshot attachment | ❌ |
| `/pdf` | Upload → Classify → Profile → Confirm | Document import | ❌ |

### 5.3 Command Menu Registration

Commands are registered with Telegram's Bot API so they appear in the "/" autocomplete menu:

```typescript
bot.telegram.setMyCommands([
  { command: "in", description: "Record monthly income" },
  { command: "out", description: "Record monthly expense" },
  // ...
], { scope: { type: "all_private_chats" } })
```

Register for both `all_private_chats` and `all_group_chats` scopes if group support is needed.

---

## 6. Document Processing Pipeline

### 6.1 Overview

The document pipeline allows users to upload files (PDFs) via Telegram, have them automatically classified and parsed, then save the extracted data to the database — all within a conversational flow.

```
┌──────────┐    ┌───────────┐    ┌──────────────┐    ┌───────────┐    ┌─────────┐
│  Upload   │───►│  Parse    │───►│  Classify    │───►│  Extract  │───►│  Save   │
│  (Telegram│    │  (Text)   │    │  (Type +     │    │  (Structured│   │  (DB)   │
│  file)    │    │           │    │  Confidence) │    │  data)     │    │         │
└──────────┘    └───────────┘    └──────────────┘    └───────────┘    └─────────┘
     │                │                 │                  │               │
   10MB max      pdfjs-dist       Keyword-based      Type-specific    Upsert with
   PDF only      text extract     weighted scoring   regex parsers    conflict keys
```

### 6.2 Upload & Validation

**Trigger:** User sends a PDF document to the bot (auto-detected by MIME type), or types `/pdf`.

**Validation rules:**
- File size: ≤ 10 MB
- MIME type: `application/pdf`
- Text content: ≥ 50 characters (reject scanned/image-only PDFs)

**File download:**
1. Get file ID from `ctx.message.document.file_id`
2. Convert to download URL: `bot.telegram.getFileLink(fileId)` → HTTPS URL
3. Fetch file contents via HTTP

### 6.3 PDF Parsing

**Library:** `pdfjs-dist` (Mozilla's PDF.js, server-side)

**Output:**
```typescript
interface ParsedPdf {
  text: string          // All text concatenated
  pageCount: number     // Number of pages
  pages: string[]       // Text per page
}
```

**Dynamic import** to avoid loading the heavy library at module load time.

### 6.4 Document Classification

**Approach:** Keyword-based weighted scoring (no ML required).

For each document type, define a set of keywords with weights:

```typescript
interface ClassificationRule {
  type: DocumentType
  keywords: { pattern: string | RegExp; weight: number }[]
}
```

**Scoring:**
1. For each type, sum weights of all matched keywords
2. Highest score wins
3. Confidence levels:
   - **High** (🟢): Score ≥ threshold AND significantly above second-best
   - **Medium** (🟡): Score ≥ threshold but close to second-best
   - **Low** (🔴): Score below threshold

**User confirmation:** Always show the detected type and confidence, with option to override:

```
📄 Detected: Bank Statement (🟢 High confidence)

[ ✅ Correct ]
[ 📋 CPF Statement ]  [ 🏦 Credit Card ]  [ 📊 Tax NOA ]  ...
```

### 6.5 Data Extraction

Each document type has its own extractor function that uses regex patterns to pull structured data from the raw text:

```typescript
interface ExtractionResult {
  type: DocumentType
  data: Record<string, any>    // Type-specific structured data
  warnings: string[]            // Non-fatal issues found
  summary: string               // Human-readable summary for confirmation
}
```

**Extractor pattern:**
```typescript
function extractBankStatement(text: string, pages: string[]): ExtractionResult {
  // 1. Find account number (regex)
  // 2. Find statement period (regex)
  // 3. Find opening/closing balance (regex)
  // 4. Parse transaction table (line-by-line regex)
  // 5. Return structured result + warnings
}
```

### 6.6 Confirmation & Save

After extraction, show a formatted summary and ask for confirmation:

```
📄 Bank Statement — DBS ****1234
Period: 1 Mar – 31 Mar 2026
Opening: $12,345.67
Closing: $15,678.90
Transactions: 47 found

[ ✅ Save ]  [ ❌ Cancel ]
```

On confirm, save using domain-specific upsert logic (see [Data Mutation Patterns](#8-data-mutation-patterns)).

### 6.7 Extending the Pipeline

To add a new document type:

1. Add type to the `DocumentType` enum
2. Add classification keywords + weights
3. Write an extractor function
4. Add save logic for the extracted data
5. Add the type to the confirmation UI buttons

---

## 7. Scheduled Notifications

### 7.1 Architecture

```
Cron Service (e.g., Vercel Cron)
  │
  │  GET /api/cron/reminders (Bearer token auth)
  │
  ▼
Reminder Endpoint
  ├─ Fetch all active schedules from DB
  ├─ For each schedule: shouldFire(schedule, now)?
  │    ├─ Convert "now" to user's timezone
  │    ├─ Check day_of_month match
  │    ├─ Check month_of_year match (if yearly)
  │    └─ Check hour match
  ├─ Generate message from template
  └─ Send via Telegram API: POST sendMessage
```

### 7.2 Schedule Configuration

Stored in a `prompt_schedule` table:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organization_id` | UUID | FK to organization |
| `prompt_type` | string | Template identifier (e.g., "monthly_summary", "yearly_review") |
| `frequency` | enum | "daily", "weekly", "monthly", "yearly" |
| `day_of_month` | int | 1-31 (for monthly/yearly) |
| `month_of_year` | int | 1-12 (for yearly only) |
| `day_of_week` | int | 0-6 (for weekly only, 0=Sunday) |
| `time` | string | "HH:mm" in user's timezone |
| `timezone` | string | IANA timezone (e.g., "Asia/Singapore") |
| `enabled` | boolean | Toggle on/off |

### 7.3 Timezone Handling

**Critical:** All schedule times are in the **user's timezone**. The cron endpoint must:

1. Get current UTC time
2. For each schedule, convert to the schedule's timezone using `Intl.DateTimeFormat`
3. Compare local hour, day, month against schedule fields

```typescript
function shouldFire(schedule: Schedule): boolean {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timezone,
    hour: "numeric", day: "numeric", month: "numeric"
  })
  const parts = formatter.formatToParts(now)
  const localHour = parts.find(p => p.type === "hour")?.value
  const localDay = parts.find(p => p.type === "day")?.value
  // ... compare against schedule
}
```

### 7.4 Message Templates

Each `prompt_type` maps to a template function that generates the message body:

```typescript
type TemplateFunction = (context: TemplateContext) => string

interface TemplateContext {
  profileNames: string[]
  organizationId: string
  dashboardUrl: string
  now: { year: number; month: string; day: number }
  // Domain-specific data fetched per template
}
```

**Template types (abstract):**

| Type | Frequency | Purpose |
|------|-----------|---------|
| `end_of_period` | Monthly | Remind to review/complete data for the period |
| `periodic_summary` | Monthly/Yearly | Summary of key metrics for the period |
| `recurring_item` | Monthly | Remind about recurring items (bills, subscriptions) |
| `annual_review` | Yearly | Comprehensive yearly review prompt |
| `event_digest` | Weekly | Digest of upcoming events or deadlines |

### 7.5 Message Delivery

**Delivery targets (priority order):**
1. Profile-level `telegram_chat_id` (send to each linked profile individually)
2. Organization-level `telegram_chat_id` (fallback: send to the main chat)

**Delivery method:** Direct Telegram API call (not through Telegraf):

```
POST https://api.telegram.org/bot{token}/sendMessage
{
  "chat_id": "...",
  "text": "...",
  "parse_mode": "HTML"
}
```

**Error handling:**
- Log errors per schedule; don't stop processing other schedules
- Return summary: `{ sent: number, errors: string[] }`

---

## 8. Data Mutation Patterns

### 8.1 Upsert Strategy

Most data entry commands use **upsert** (insert or update on conflict) to handle repeated entries for the same period/entity:

```sql
INSERT INTO table (key1, key2, value, source, updated_at)
VALUES ($1, $2, $3, 'telegram', now())
ON CONFLICT (key1, key2) DO UPDATE SET
  value = EXCLUDED.value,
  source = EXCLUDED.source,
  updated_at = EXCLUDED.updated_at
```

**Common conflict keys:**

| Pattern | Conflict Key | Use Case |
|---------|-------------|----------|
| Entity + Period | `(profile_id, month)` | Monthly data points |
| Entity + Entity | `(organization_id, symbol)` | Holdings, balances |
| Entity + Period + Detail | `(profile_id, month, description, amount)` | Transactions |

### 8.2 Source Tracking

All mutations include a `source` field to track where data originated:

| Source | Meaning |
|--------|---------|
| `"telegram"` | Entered via Telegram bot |
| `"web"` | Entered via web dashboard |
| `"import"` | Imported from PDF/file |
| `"api"` | Entered via external API |

### 8.3 Mutation Types

| Type | Pattern | Example |
|------|---------|---------|
| **Simple upsert** | One row, one table | Monthly cashflow entry |
| **Multi-table insert** | Insert parent + children | Insurance policy + coverages |
| **Running balance update** | Read-modify-write with calculation | Investment buy (recalculate weighted average) |
| **Cascading update** | Update parent + derived child | Goal contribution + goal current amount |
| **Conditional upsert** | Find-or-create parent, then upsert child | Bank account lookup → balance snapshot |

### 8.4 Entity Matching (Document Import)

When importing from documents, the bot must match extracted data to existing entities:

**Matching strategies:**
1. **Last N digits** — Match account by last 4 digits of account number
2. **Name similarity** — Match product/entity by name (case-insensitive contains)
3. **Organization name** — Match by known organization/bank names
4. **Create if missing** — Some entity types auto-create on import

**Failure handling:** If no match found, show error with actionable message:
```
❌ No matching account found for ****1234.
Please add this account in the web dashboard first, then try again.
```

---

## 9. Security & Input Handling

### 9.1 Webhook Security

| Layer | Implementation |
|-------|---------------|
| **Secret token** | Telegram sends `x-telegram-bot-api-secret-token` header; webhook validates against `TELEGRAM_WEBHOOK_SECRET` env var |
| **HTTPS only** | Telegram requires HTTPS webhook URLs |
| **No webhook reply** | `webhookReply: false` prevents data leaks in HTTP response |

### 9.2 Input Sanitization

All user text inputs are sanitized before storage or display:

```typescript
function sanitizeText(input: string, maxLength = 2000): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")  // Strip control chars
    .replace(/&/g, "&amp;")                                  // HTML-encode
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .slice(0, maxLength)
}
```

**Applied to:** All free-text fields (memos, notes, names).

### 9.3 API Key Security

| Measure | Detail |
|---------|--------|
| Hash-only storage | Raw API keys are never stored; only SHA-256 hash |
| Prefix format | `fdb_` prefix for easy identification (non-secret) |
| Member limits | `max_members` field prevents unlimited sharing |
| Upsert linking | Re-linking same user + key is idempotent |

### 9.4 OTP Security

| Measure | Detail |
|---------|--------|
| Hash-only storage | OTP hash stored, plaintext sent once in chat |
| Short expiry | 5-minute TTL |
| Single use | Consumed on verification |

### 9.5 Session Security

- Sessions stored server-side in database (not in Telegram messages)
- Keyed by chat ID (unique per user-bot conversation)
- Cleared when wizard scene exits
- No sensitive data (passwords, keys) stored in session

### 9.6 Callback Data Limits

Telegram limits `callback_data` to **64 bytes**. Strategies:
- Use short prefixes: `m_`, `qa_`, `ed_`
- Truncate display names in callback data
- Use IDs instead of full names where possible
- Encode compound values with delimiters: `prefix_id_name`

---

## 10. Database Schema (Bot Infrastructure)

These tables are **required for the bot platform** regardless of domain:

### 10.1 `telegram_sessions`

Stores Telegraf session state between webhook requests.

```sql
CREATE TABLE telegram_sessions (
  id TEXT PRIMARY KEY,                -- Session key (chat_id based)
  session_data JSONB NOT NULL,        -- Full Telegraf session state
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 10.2 `linked_telegram_accounts`

Links Telegram users to app accounts via API keys.

```sql
CREATE TABLE linked_telegram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_api_key_id UUID REFERENCES link_api_keys(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  telegram_chat_id TEXT,
  linked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (link_api_key_id, telegram_user_id)
);

CREATE INDEX idx_linked_telegram_user ON linked_telegram_accounts(telegram_user_id);
```

### 10.3 `link_api_keys`

API keys for Telegram account linking.

```sql
CREATE TABLE link_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  key_hash TEXT NOT NULL UNIQUE,       -- SHA-256 hash
  key_prefix TEXT NOT NULL,            -- First 8 chars for display
  label TEXT,                          -- User-defined label
  max_members INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 10.4 `otp_tokens`

One-time passwords for web login.

```sql
CREATE TABLE otp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  otp_hash TEXT NOT NULL,              -- SHA-256 hash
  expires_at TIMESTAMPTZ NOT NULL,     -- 5-min TTL
  used_at TIMESTAMPTZ,                 -- Null until consumed
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 10.5 `prompt_schedule`

Scheduled notification configuration.

```sql
CREATE TABLE prompt_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  prompt_type TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  month_of_year INTEGER CHECK (month_of_year BETWEEN 1 AND 12),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  time TEXT NOT NULL,                  -- "HH:mm"
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 10.6 Profile / Account Telegram Fields

Add these columns to your user/profile table:

```sql
ALTER TABLE profiles ADD COLUMN telegram_user_id TEXT;
ALTER TABLE profiles ADD COLUMN telegram_username TEXT;
ALTER TABLE profiles ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE profiles ADD COLUMN telegram_link_token UUID;
ALTER TABLE profiles ADD COLUMN telegram_last_used TIMESTAMPTZ;

CREATE INDEX idx_profiles_telegram_user ON profiles(telegram_user_id);
CREATE INDEX idx_profiles_telegram_username ON profiles(telegram_username);
```

Add to your account/organization table:

```sql
ALTER TABLE accounts ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE accounts ADD COLUMN account_type TEXT DEFAULT 'owner'
  CHECK (account_type IN ('owner', 'public'));
```

---

## 11. UX Patterns & Design Language

### 11.1 Message Formatting

All bot messages use **HTML parse mode** (`parse_mode: "HTML"`).

**Formatting conventions:**

| Element | Format | Example |
|---------|--------|---------|
| Step header | `[step/total] Context` | `[2/4] Recording income for Alice` |
| Success | `✅ Description` | `✅ Income of $5,000 saved for March 2026.` |
| Error | `❌ Hint` + optional example | `❌ Invalid amount. Enter a positive number.\nExample: 500` |
| Amounts | `$X,XXX.XX` | `$1,234.56` |
| Confirmation | Divider + field list | See below |

**Confirmation message format:**
```
─────────────
📝 <b>Confirm Income</b>
─────────────
Profile: Alice
Month: March 2026
Amount: $5,000.00
Note: Monthly salary
─────────────
```

### 11.2 Keyboard Patterns

| Pattern | Use | Layout |
|---------|-----|--------|
| Entity selection | Profile, goal, loan, product | 1-2 columns, max 20 items |
| Month picker | 6 months, current first | 3 columns × 2 rows |
| Quick amounts | Common dollar values | Single row: $100, $500, $1000 |
| Confirmation | Confirm + Cancel + Edit buttons | Row 1: ✅ ❌ / Row 2+: ✏️ fields |
| Binary choice | Yes/No, Link/Create | Single row: 2 buttons |
| Document type override | All supported types | 2 columns |

### 11.3 Progress Indicators

Show step progress at the top of each wizard message:

```
[1/4] Select your profile
[2/4] Choose the month
[3/4] Enter the amount
[4/4] Confirm and save
```

### 11.4 Error Recovery

| Scenario | Behavior |
|----------|----------|
| Invalid input | Show error + stay on same step (don't advance) |
| Database error | Show `❌ Something went wrong. Please try again.` + leave scene |
| Missing session data | Show error + leave scene (session corrupted) |
| Scene timeout | Telegraf's `handlerTimeout` expires; user must restart command |
| `/cancel` at any point | Immediately leave scene with "Cancelled." message |

### 11.5 Auto-Selection

When a selection step has only **one option**, always auto-select it and skip to the next step. This removes unnecessary taps for users with simple setups (single profile, single goal, etc.).

---

## Appendix A: Reference Implementation — Personal Finance

This section documents the **domain-specific** implementation built on top of the core platform. Use it as a reference for how to adapt the platform to your domain.

### A.1 Domain: Singapore Household Finance Tracking

**Users:** Singapore residents tracking household finances (income, expenses, investments, insurance, CPF, loans, goals, tax).

**Web dashboard:** Full-featured financial dashboard with charts, projections, and multi-user (family) support.

**Telegram bot:** Quick data entry for monthly tracking, document import for statements, reminders for periodic reviews.

### A.2 Entity Hierarchy

```
Account (household)
  └─ Family (e.g., "The Smiths")
       ├─ Profile (Alice — linked to Telegram)
       └─ Profile (Bob — linked to Telegram)
```

### A.3 Commands & Data Tables

| Command | Table(s) | Conflict Key | Fields |
|---------|----------|-------------|--------|
| `/in` | `monthly_cashflow` | `profile_id, month` | `inflow`, `inflow_memo`, `source` |
| `/out` | `monthly_cashflow` | `profile_id, month` | `outflow`, `outflow_memo`, `source` |
| `/buy` | `investments`, `investment_transactions`, `investment_accounts` | `family_id, symbol` | `units`, `cost_basis`, `type`, `quantity`, `price` |
| `/sell` | Same as `/buy` | Same | Same (reverse direction) |
| `/ilp` | `ilp_entries` | `product_id, month` | `fund_value` |
| `/goaladd` | `goal_contributions`, `savings_goals` | — (insert) | `amount`, `source`; updates `current_amount` |
| `/repay` | `loan_repayments` | — (insert) | `loan_id`, `amount`, `date` |
| `/earlyrepay` | `loan_early_repayments` | — (insert) | `loan_id`, `amount`, `date` |
| `/stockimg` | `investment_transactions` | — (update) | `screenshot_url` |

### A.4 PDF Document Types

| Type | Classification Keywords | Extracted Data | Target Table(s) |
|------|------------------------|----------------|-----------------|
| `cpf_statement` | "central provident fund", "CPF", "ordinary account" | OA/SA/MA balances, month | `cpf_balances` |
| `insurance_policy` | "policy schedule", "AIA", "sum assured" | Policy details, coverages | `insurance_policies`, `insurance_policy_coverages` |
| `bank_statement` | "statement of account", "DBS", "opening balance" | Balances, transactions | `bank_balance_snapshots`, `bank_transactions` |
| `cc_statement` | "credit card", "statement date", "minimum payment" | Transactions, statement total | `bank_transactions` (type="cc") |
| `tax_noa` | "notice of assessment", "IRAS" | Year, tax payable | `tax_entries` |
| `loan_letter` | "housing loan", "repayment schedule" | Principal, rate, tenure | `loans` |
| `ilp_statement` | "investment-linked", "fund value" | Product, month, fund value | `ilp_entries` |
| `investment_statement` | "holdings", "portfolio", "brokerage" | Symbol, units, cost | `investments` |

### A.5 Reminder Templates

| Type | Frequency | Content |
|------|-----------|---------|
| `end_of_month` | Monthly (day 28) | "Time to review your March finances! Log income with /in and expenses with /out." |
| `income_monthly` | Monthly | "Reminder: Log your take-home pay for {month}. Last month: ${amount}." |
| `income_yearly` | Yearly | "It's {year}! Time to review your annual income. Check the dashboard: {url}" |
| `insurance_monthly` | Monthly | "Insurance premium due: {policy} — ${amount}" |
| `insurance_yearly` | Yearly | "Annual insurance review: check all policies at {url}" |
| `tax_yearly` | Yearly | "Tax season! Estimated tax: ${amount}. Review at {url}" |
| `seasonality` | Weekly (Monday) | "📅 Market events this week: {events}" |

### A.6 Investment-Specific Logic

**Weighted average cost on buy:**
```
new_cost_basis = (existing_units × existing_cost_basis + new_qty × new_price)
                 / (existing_units + new_qty)
```

**Cash balance tracking:**
- Buy: `cash_balance -= quantity × price`
- Sell: `cash_balance += quantity × price`

**Stock symbol resolution:**
- Search external API (FMP) for company name
- Exact match → auto-accept
- Multiple matches → show picker (max 8)
- No match → accept raw symbol

### A.7 Bank Account Matching

When importing bank/CC statements:
1. Extract last 4 digits of account number from PDF
2. Search `bank_accounts` where `account_number LIKE '%1234'`
3. If no match, try matching by bank name
4. If still no match, error with actionable message

---

## Appendix B: Building a New Product with This PRD

### B.1 Steps to Adapt

1. **Define your entities:** Replace profiles/families with your domain's user model
2. **Define your commands:** Map your data entry needs to wizard scenes
3. **Define your document types:** What files will users upload? What data to extract?
4. **Define your reminders:** What periodic messages should users receive?
5. **Implement the core platform:** Bot init, webhook, session store, auth linking
6. **Build domain wizards:** One scene per command, following the wizard framework
7. **Build document extractors:** One extractor per document type
8. **Build reminder templates:** One template per notification type

### B.2 What to Keep As-Is

- Bot singleton + webhook architecture
- Session store (Supabase JSONB)
- Middleware stack (session → stage → cancel)
- Auth linking (OTP + API key + token)
- Wizard framework (steps, confirmation, edit flow)
- Input sanitization
- Callback data conventions
- UX patterns (progress headers, error format, keyboard layouts)

### B.3 What to Customize

- Command names and descriptions
- Wizard steps and data fields per command
- Database tables and upsert conflict keys
- Document types, classifiers, and extractors
- Reminder templates and schedule types
- Entity matching logic for imports
- External API integrations (stock search → your domain's APIs)
- Message templates and formatting

### B.4 Minimum Viable Bot

For the simplest possible product, implement:

1. ✅ Core platform (bot, webhook, session, auth)
2. ✅ 1-2 data entry commands (wizard scenes)
3. ❌ Document processing (add later)
4. ❌ Scheduled notifications (add later)
5. ❌ Cross-prompt suggestions (add later)

This gives you a working Telegram bot that can authenticate users and record data in ~500 lines of domain code on top of the platform.
