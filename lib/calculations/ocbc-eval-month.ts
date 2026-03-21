/** First day of the current calendar month in Asia/Singapore, as `YYYY-MM-01`. */
export function ocbcEvalMonthFirstDayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  if (!y || !m) {
    throw new Error("Failed to format OCBC eval month")
  }
  return `${y}-${m}-01`
}
