export interface Holding {
  id: string
  symbol: string
  type: string
  units: number
  /** Average cost per unit (SGD, matches DB cost_basis). */
  costPerUnit: number
  costBasis: number
  currentPrice: number | null
  currentValue: number | null
  pnl: number | null
  pnlPct: number | null
  portfolioPct: number
  createdAt?: string
}
