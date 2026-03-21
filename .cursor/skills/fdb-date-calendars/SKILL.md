---
name: fdb-date-calendars
description: >-
  Date, calendar, range, and month/year UI using shadcn Calendar and project
  pickers. Use when implementing or changing date pickers, date ranges,
  calendars, scheduling dates, month/year selection, datetime-style fields, or
  timezone-aware date display.
---

# FDB Tracker — Dates & Calendars

## Primary references (read these first)

Implementation patterns and API details live in the official docs. **Start from these** when building or extending behavior, then map to this repo’s files.

- **[shadcn Calendar](https://ui.shadcn.com/docs/components/radix/calendar)** — `DayPicker` / `Calendar`: `mode` (`single` | `range`), `captionLayout="dropdown"`, presets, range across months, `timeZone`, disabled/booked dates, cell sizing, week numbers. See [React DayPicker](https://react-day-picker.js.org/) for full API.
- **[shadcn Date Picker](https://ui.shadcn.com/docs/components/radix/date-picker)** — composition: **Popover + trigger (often Button) + `Calendar`**. Examples: range, DOB-style caption, input-triggered picker, time alongside date.

Use these docs for **inspiration on new use cases** (presets, datetime, input triggers, natural language, etc.). Adapt to existing project components and styling — do not pull in unrelated date libraries unless the task requires it.

## Project primitives

- **`Calendar`** — [`components/ui/calendar.tsx`](../../../components/ui/calendar.tsx) (`import { Calendar } from "@/components/ui/calendar"`). This is the shadcn/ui calendar; keep usage aligned with the docs above.
- **Reuse wrappers** before duplicating Popover + Calendar wiring:
  - [`components/ui/date-picker.tsx`](../../../components/ui/date-picker.tsx) — single date as `yyyy-MM-dd` strings; min/max; uses `captionLayout="dropdown"`.
  - [`components/ui/date-range-picker.tsx`](../../../components/ui/date-range-picker.tsx) — `mode="range"`, two months.
  - [`components/ui/schedule-date-picker.tsx`](../../../components/ui/schedule-date-picker.tsx) — schedule day/month selection.
- **Month + year only (no day)** — [`components/ui/month-year-picker.tsx`](../../../components/ui/month-year-picker.tsx) (`MonthYearPicker`). Values like `YYYY-MM-01`. Do not use the day grid `Calendar` when the product only needs month/year.

## Rules

- Prefer **`Calendar` from `@/components/ui/calendar`** for day-level or range-level picking. Avoid native `<input type="date">` and ad-hoc calendar UIs unless the user explicitly asks.
- Extend existing pickers with new props when possible instead of copying the same Popover + Calendar structure.
- If the `calendar` primitive is missing or must be re-added, use **shadcn MCP** to match [`components.json`](../../../components.json) (same as [`fdb-frontend`](../fdb-frontend/SKILL.md)).
- **Birth year only** — [`components/ui/birth-date-picker.tsx`](../../../components/ui/birth-date-picker.tsx) uses a `Select` by design; keep that pattern for year-only birth fields.

## Related

- General UI stack and shadcn usage: [`fdb-frontend`](../fdb-frontend/SKILL.md).
