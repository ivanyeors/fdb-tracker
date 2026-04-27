/**
 * FMP/Yahoo often use `-` where holdings use `.` (e.g. BRK-B vs BRK.B).
 * Use these variants for map keys and cache keys so lookups stay consistent.
 */
export function tickerLookupVariants(symbol: string): string[] {
  const u = symbol.toUpperCase().trim()
  return [...new Set([u, u.replaceAll(/\./g, "-"), u.replaceAll(/-/g, ".")])]
}
