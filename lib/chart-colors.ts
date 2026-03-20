import { scaleOrdinal } from "@visx/scale"

/**
 * Dashboard ordinal palette — matches `--chart-1`…`--chart-5` and `--chart-neutral`
 * in globals / shadcn theme. Use for category charts (donuts, bars) so colors align
 * across the app.
 */
export const THEME_CATEGORY_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-neutral)",
] as const

function uniqueCategoriesPreserveOrder(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    if (!seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

/** One color per category index, cycling through the theme when there are many slices. */
export function themeOrdinalRange(length: number): string[] {
  if (length <= 0) return []
  const seq = THEME_CATEGORY_COLORS
  return Array.from({ length }, (_, i) => seq[i % seq.length])
}

/**
 * Ordinal color scale: stable mapping from category name → CSS theme color.
 * Category order follows first appearance in `namesInVisualOrder` (e.g. value-desc),
 * so the largest slice gets `--color-chart-1`, etc.
 */
export function createCategoryColorScale(namesInVisualOrder: readonly string[]) {
  const domain = uniqueCategoriesPreserveOrder(namesInVisualOrder)
  return scaleOrdinal<string, string>({
    domain,
    range: themeOrdinalRange(domain.length),
  })
}
