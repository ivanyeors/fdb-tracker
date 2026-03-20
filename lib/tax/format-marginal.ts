import type { TaxSnapshot } from "@/lib/tax/tax-snapshot"
import { formatCurrency } from "@/lib/utils"

/** One-line description of top marginal band from a tax snapshot */
export function formatMarginalBandLine(snapshot: TaxSnapshot): string {
  if (snapshot.chargeableIncome <= 0) {
    return "No chargeable income — no marginal rate applies."
  }
  const pct = (snapshot.marginalRate * 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })
  const from = formatCurrency(snapshot.marginalBandFrom)
  if (snapshot.marginalBandTo == null) {
    return `${pct}% on chargeable income above $${from}.`
  }
  const to = formatCurrency(snapshot.marginalBandTo)
  return `${pct}% marginal band: above $${from} up to $${to}.`
}
