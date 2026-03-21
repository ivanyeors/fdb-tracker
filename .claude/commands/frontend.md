# Frontend Development Guide

Apply these conventions when building UI components, pages, or layouts in fdb-tracker.

## Stack

- Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui v4 (radix-nova style, stone base)
- Icons: lucide-react
- Charts: **visx only** (`@visx/*`) — never use Recharts or other chart libraries
- Toasts: Sonner (`toast.success` / `toast.error` from `sonner`)
- Theme: next-themes (light/dark). `<Toaster />` from `@/components/ui/sonner` must be inside `ThemeProvider` in root layout.

## Adding shadcn Components

Use the CLI: `npx shadcn@latest add <component>`. Do not manually copy component code. Config is in `components.json`.

## Layout Pattern

- Side nav + main content area. Dashboard and Settings share a sidebar layout via the `(app)` route group.
- Most dashboard pages use **Combined | Person A | Person B** tabs.
- Data is filtered by `profileId` or aggregated when "Combined" is selected.
- Profile/family state comes from `useActiveProfile()` hook (`@/hooks/use-active-profile`).

## Page Structure

Each dashboard page typically follows:

```tsx
"use client"

import { useActiveProfile } from "@/hooks/use-active-profile"
import { useEffect, useState } from "react"
import { toast } from "sonner"

export default function ExamplePage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch(`/api/example?profileId=${activeProfileId}&familyId=${activeFamilyId}`)
        if (!res.ok) throw new Error("Failed to fetch")
        setData(await res.json())
      } catch {
        toast.error("Failed to load data")
      } finally {
        setLoading(false)
      }
    }
    if (activeFamilyId) fetchData()
  }, [activeProfileId, activeFamilyId])

  if (loading) return <LoadingSkeleton />
  return <>{/* page content */}</>
}
```

## Key Components

- **MetricCard** (`@/components/dashboard/metric-card`) — displays a metric with label, value, optional tooltip, loading skeleton.
- **SectionHeader** (`@/components/dashboard/section-header`) — section title with optional actions.
- **InfoTooltip** (`@/components/ui/info-tooltip`) — info icon with hover tooltip. Content from `lib/tooltips.ts` registry. Uses HoverCard for rich content (>100 chars), Tooltip for short.
- **CurrencyInput** (`@/components/ui/currency-input`) — for dollar amount fields. See `/money-inputs` skill.
- **Date pickers** — project primitives in `components/ui/`. See `/date-pickers` skill.

## Tooltips

Add Info icon next to metrics and config fields. Tooltip content lives in `lib/tooltips.ts` as structured entries:
- **Logic** — formula or calculation
- **Explanation** — what it means
- **Details** — caveats or edge cases

## Forms

- State management: `useState` (no React Hook Form).
- Validation: Zod schemas (in `lib/validations/` or inline).
- Modals: Sheet or Dialog components.
- Feedback: `toast.success()` / `toast.error()` after API calls.

## Styling

- Prettier formats Tailwind classes via `prettier-plugin-tailwindcss`.
- Use `cn()` from `@/lib/utils` for conditional classes.
- Dark mode is automatic via CSS variables — no manual dark: prefixes needed for shadcn components.
