---
name: fdb-frontend
description: Frontend development for fdb-tracker finance dashboard. Use when building UI components, pages, or layouts. Requires shadcn MCP for adding components. Covers Next.js 16, React 19, Tailwind, shadcn/ui patterns, and dashboard-specific conventions.
---

# FDB Tracker Frontend

Frontend development guidelines for the finance tracking dashboard. Use shadcn MCP when adding new UI components.

## When to Apply

- Building dashboard pages, layouts, or components
- Adding shadcn/ui components
- Implementing side nav, tabs, or data tables
- Styling with Tailwind
- Creating forms or modals
- Date pickers, calendars, ranges, month/year fields — read [`fdb-date-calendars`](../fdb-date-calendars/SKILL.md) (shadcn Calendar + project pickers)

## Stack

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS 4**
- **shadcn/ui** (radix-nova style, stone base)

## Component Addition

**Use shadcn MCP** to add components. Do not manually copy component code when shadcn provides the component — use the MCP to add it.

Example: Adding a new component → invoke shadcn MCP `add_component` or equivalent with component name (e.g. `tabs`, `card`, `table`, `dialog`).

## Project Conventions

- **Path alias:** `@/*` → project root
- **Components:** `components/ui/` for shadcn; `components/` for app-specific
- **Layout:** Side nav + main content; tabs for Combined | Person A | Person B
- **Theme:** next-themes (light/dark); Geist Mono + DM Sans fonts
- **Action feedback:** After user-triggered saves, deletes, and API submits, use Sonner (`toast.success` / `toast.error` from `sonner`). The root layout (`app/layout.tsx`) must render `<Toaster />` from `@/components/ui/sonner` inside `ThemeProvider` so toasts respect light/dark mode.
- **Charts:** Use **[visx](https://airbnb.io/visx/)** (`@visx/*`) only. Do **not** use Recharts or other chart libraries.

## Page Pattern

Each page (except Settings) follows:

1. Combined view by default
2. Tabs: `Combined | [Person A] | [Person B]`
3. Data filtered by `profile_id` or combined when tab selected

## Key Pages

- **Onboarding** — Multi-step wizard before dashboard; profiles, income, banks, prompt schedule; progress indicator, tooltips
- Dashboard (overview)
- Banks, CPF, Investments, Savings Goals, Cashflow, Loans, Tax
- Settings (no tabs)

## Tooltips

Use tooltips to explain calculation logic, formulas, and assumptions. Add Info icon (`HelpCircle` or `Info`) next to metrics and config fields; wrap in shadcn `Tooltip` or `HoverCard` for longer content. Content from `lib/tooltips.ts` registry. Structure: **Logic** (formula) → **Explanation** (meaning) → **Details** (caveats).

## References

- [components.json](components.json) — shadcn config
- [`fdb-date-calendars`](../fdb-date-calendars/SKILL.md) — Calendar, date/range pickers, `MonthYearPicker`, shadcn doc links
- [Vercel React Best Practices](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/AGENTS.md) — performance patterns
