export type MoneyFlowNodeData = {
  /** Primary display amount (e.g., "$6,000/mth") */
  amount: string
  /** Optional secondary line (e.g., "OA $2,856 / SA $746 / MA $2,400") */
  breakdown?: string
  /** Raw numeric value for edge math */
  rawAmount: number
  /** Period label */
  period: "monthly" | "annual" | "total"
}

export type MoneyFlowEdgeData = {
  /** e.g., "$6,000 × 20% = $1,200" */
  flowFormula: string
  /** Raw amount flowing along this edge */
  rawAmount: number
}

export type MoneyFlowPayload = {
  nodes: Record<string, MoneyFlowNodeData>
  edges: Record<string, MoneyFlowEdgeData>
  month: string
  profileLabel: string
}
