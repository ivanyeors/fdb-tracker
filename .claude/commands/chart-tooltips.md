# Chart Tooltip Guide

Apply this pattern when adding tooltips to any visx chart in fdb-tracker.

## Required Pattern: Portal Tooltip with Fixed Positioning

**Never use `TooltipWithBounds` from `@visx/tooltip`.** It uses `position: absolute` relative to its container and consistently breaks — mispositioned tooltips, black boxes, and CSS variable issues.

Instead, use `createPortal` to render a `position: fixed` tooltip on `document.body`, positioned at the mouse cursor via `e.clientX` / `e.clientY`.

## Imports

```tsx
import { createPortal } from "react-dom"
import { useTooltip } from "@visx/tooltip"
// Do NOT import TooltipWithBounds
```

## Hook Setup

```tsx
const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
  useTooltip<YourTooltipDataType>()
```

## Mouse Handlers (on SVG elements)

```tsx
onMouseMove={(e) => {
  showTooltip({
    tooltipData: { /* your data */ },
    tooltipLeft: e.clientX,
    tooltipTop: e.clientY,
  })
}}
onMouseLeave={hideTooltip}
```

**Key rules:**
- Always use `e.clientX` / `e.clientY` — never `getBoundingClientRect()`.
- Never compute container-relative offsets with `containerRef`.

## Tooltip Rendering

```tsx
{tooltipOpen &&
  tooltipData &&
  typeof document !== "undefined" &&
  createPortal(
    <div
      key={`${tooltipData.label}-${tooltipLeft}-${tooltipTop}`}
      role="tooltip"
      className="pointer-events-none z-[9999] max-w-[min(280px,calc(100vw-24px))] rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-lg"
      style={{
        position: "fixed",
        left: tooltipLeft,
        top: tooltipTop,
        transform: "translate(12px, 12px)",
        fontSize: 12,
      }}
    >
      {/* Tooltip content */}
    </div>,
    document.body,
  )}
```

**Key rules:**
- Place outside the `<svg>` but inside the wrapper `<div>`.
- Use Tailwind classes (`bg-card`, `text-card-foreground`, `border-border`) for theme-aware styling — not inline CSS variables in `style={}`.
- `pointer-events-none` prevents the tooltip from interfering with mouse events.
- `z-[9999]` ensures it renders above modals/sheets.
- `transform: "translate(12px, 12px)"` offsets the tooltip slightly from the cursor.
- The `key` prop with coordinates forces React to re-render on position change.

## Hover Highlight (Optional, for Pie/Donut Charts)

```tsx
const [hoveredArcIndex, setHoveredArcIndex] = useState<number | null>(null)

// In the arc path:
onMouseMove={(e) => {
  setHoveredArcIndex(arc.index)
  showTooltip({ ... })
}}
onMouseLeave={() => {
  setHoveredArcIndex(null)
  hideTooltip()
}}

// On the path element:
style={{ opacity: hoveredArcIndex !== null && hoveredArcIndex !== arc.index ? 0.45 : 1 }}
className="cursor-pointer transition-[opacity] duration-150"
```

## Reference Implementations

- **Donut chart:** `components/dashboard/cpf/cpf-overview-chart.tsx`
- **Donut with legend:** `components/dashboard/tax/tax-relief-donut.tsx`
- **Horizontal waterfall:** `components/dashboard/cashflow/waterfall-chart.tsx`
- **Sankey flow:** `components/dashboard/cashflow/cashflow-sankey.tsx`
