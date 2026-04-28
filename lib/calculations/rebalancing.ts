/**
 * Investment portfolio rebalancing calculations.
 * Compares current allocation against targets and suggests adjustments.
 */

export type AllocationEntry = {
  id: string
  symbol: string
  currentValue: number
  targetPct: number | null
}

export type RebalanceSuggestion = {
  id: string
  symbol: string
  currentPct: number
  targetPct: number
  driftPct: number
  /** Positive = buy more, negative = sell */
  adjustmentAmount: number
  action: "buy" | "sell" | "hold"
}

const DRIFT_THRESHOLD = 5 // Percentage points

/**
 * Calculate rebalancing suggestions for holdings with target allocations.
 * Only returns suggestions for holdings that have a targetPct set and drift > threshold.
 */
function rebalanceAction(adjustmentAmount: number): "buy" | "sell" | "hold" {
  if (adjustmentAmount > 0) return "buy"
  if (adjustmentAmount < 0) return "sell"
  return "hold"
}

export function calculateRebalancing(
  entries: AllocationEntry[],
  driftThreshold: number = DRIFT_THRESHOLD,
): RebalanceSuggestion[] {
  const totalValue = entries.reduce((s, e) => s + Math.max(0, e.currentValue), 0)
  if (totalValue <= 0) return []

  const suggestions: RebalanceSuggestion[] = []

  for (const entry of entries) {
    if (entry.targetPct == null) continue

    const currentPct = (Math.max(0, entry.currentValue) / totalValue) * 100
    const driftPct = currentPct - entry.targetPct
    const absDrift = Math.abs(driftPct)

    if (absDrift > driftThreshold) {
      const targetValue = (entry.targetPct / 100) * totalValue
      const adjustmentAmount = Math.round((targetValue - entry.currentValue) * 100) / 100

      suggestions.push({
        id: entry.id,
        symbol: entry.symbol,
        currentPct: Math.round(currentPct * 100) / 100,
        targetPct: entry.targetPct,
        driftPct: Math.round(driftPct * 100) / 100,
        adjustmentAmount,
        action: rebalanceAction(adjustmentAmount),
      })
    }
  }

  // Sort by absolute drift descending (most drifted first)
  suggestions.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct))

  return suggestions
}
