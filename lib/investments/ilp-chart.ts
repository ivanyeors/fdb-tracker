/**
 * Normalize ILP entry `month` from API (YYYY-MM-DD or YYYY-MM) to a stable YYYY-MM key.
 */
export function ilpEntryMonthKey(raw: string): string {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7)
  if (/^\d{4}-\d{2}$/.test(s)) return s.slice(0, 7)
  return s.slice(0, 7)
}

/** Short label for chart axis / tooltip (e.g. Mar '25). */
export function formatIlpChartMonthLabel(ym: string): string {
  const [y, m] = ym.split("-")
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const mi = Math.max(0, Math.min(11, parseInt(m ?? "1", 10) - 1))
  const yy = (y ?? "").slice(-2)
  return yy ? `${monthNames[mi]} ’${yy}` : monthNames[mi]
}

export function currentMonthYm(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}
