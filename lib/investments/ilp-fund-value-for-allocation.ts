/**
 * Fund balance used to weight ILP group allocation donuts (merged holdings, sector, etc.).
 * Prefer latest entry; if latest fund_value is 0, use the most recent month with a positive balance.
 * Display fund value on cards stays latest-only — see callers.
 */

function coerceFundValue(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

export function fundValueForAllocation(
  latestEntry: { fund_value: unknown } | null | undefined,
  entries: readonly { month: string; fund_value: unknown }[],
): number {
  const latest = coerceFundValue(latestEntry?.fund_value)
  if (latest > 0) return latest

  const sorted = [...entries].sort((a, b) => b.month.localeCompare(a.month))
  for (const e of sorted) {
    const v = coerceFundValue(e.fund_value)
    if (v > 0) return v
  }
  return 0
}
