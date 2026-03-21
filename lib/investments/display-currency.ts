import { formatCurrency } from "@/lib/utils"

export type DisplayCurrency = "SGD" | "USD"

/** Convert an amount stored in SGD to the chosen display currency. */
export function sgdToDisplayAmount(
  sgd: number,
  currency: DisplayCurrency,
  sgdPerUsd: number | null,
): number {
  if (currency !== "USD") return sgd
  if (sgdPerUsd == null || sgdPerUsd <= 0) return sgd
  return Math.round((sgd / sgdPerUsd) * 100) / 100
}

/** Format a SGD-stored amount with S$ or US$ prefix. */
export function formatMoneyFromSgd(
  sgdAmount: number,
  currency: DisplayCurrency,
  sgdPerUsd: number | null,
): string {
  const effective: DisplayCurrency =
    currency === "USD" && sgdPerUsd != null && sgdPerUsd > 0
      ? "USD"
      : "SGD"
  const amt = sgdToDisplayAmount(sgdAmount, effective, sgdPerUsd)
  const formatted = formatCurrency(amt)
  return effective === "USD" ? `US$${formatted}` : `S$${formatted}`
}
