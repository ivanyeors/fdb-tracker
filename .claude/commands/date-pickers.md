# Date & Calendar Picker Guide

Apply when implementing or changing date pickers, date ranges, calendars, scheduling dates, month/year selection, or datetime fields.

## Available Project Primitives

| Component | Import | Use for |
|-----------|--------|---------|
| `Calendar` | `@/components/ui/calendar` | Day-level or range selection (shadcn DayPicker) |
| `DatePicker` | `@/components/ui/date-picker` | Single date as `yyyy-MM-dd` string; min/max; dropdown caption |
| `DateRangePicker` | `@/components/ui/date-range-picker` | Date range, two-month view |
| `MonthYearPicker` | `@/components/ui/month-year-picker` | Month + year only (no day). Values like `YYYY-MM-01` |
| `ScheduleDatePicker` | `@/components/ui/schedule-date-picker` | Schedule day/month selection |
| `BirthDatePicker` | `@/components/ui/birth-date-picker` | Year-only birth field (uses `Select`, not Calendar) |

## Rules

1. **Prefer project primitives** — reuse the wrappers above instead of building new Popover + Calendar compositions.
2. **Never use `<input type="date">`** or ad-hoc calendar UIs.
3. **Month/year only** — use `MonthYearPicker`, not the day-grid `Calendar`.
4. **Birth year only** — use `BirthDatePicker` (Select-based by design).
5. **Extend existing pickers** with new props when possible, rather than copying the Popover + Calendar wiring.
6. If the Calendar primitive is missing, re-add via `npx shadcn@latest add calendar`.

## References

- [shadcn Calendar docs](https://ui.shadcn.com/docs/components/radix/calendar) — modes, dropdown caption, presets, range, timezone, disabled dates.
- [shadcn Date Picker docs](https://ui.shadcn.com/docs/components/radix/date-picker) — composition patterns with Popover + Calendar.
- [React DayPicker](https://react-day-picker.js.org/) — full API reference.

Use these docs for inspiration on new use cases (presets, datetime, input triggers, natural language). Adapt to existing project components and styling.
