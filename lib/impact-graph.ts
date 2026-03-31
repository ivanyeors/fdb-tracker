/**
 * Impact Dependency Graph
 *
 * Static DAG that maps every user-editable input to its downstream
 * auto-calculated values. Used by:
 * - SourceBadge (shows "Auto" / "Manual" on display values)
 * - ImpactConfirmationDialog (warns user before cascading changes)
 */

// ---------------------------------------------------------------------------
// Node identifiers
// ---------------------------------------------------------------------------

export type ImpactNodeId =
  // Income
  | "income.annual_salary"
  | "income.bonus"
  // Tax
  | "tax.estimated"
  | "tax.monthly_provision"
  | "tax.reliefs_manual"
  // CPF
  | "cpf.balance_manual"
  | "cpf.projections"
  | "cpf.retirement_gap"
  | "cpf.housing_deductions"
  // Loans
  | "loan.details"
  | "loan.monthly_payment"
  | "loan.outstanding"
  | "loan.prepayment_savings"
  // Insurance
  | "insurance.policies"
  | "insurance.coverage_score"
  | "insurance.coverage_gaps"
  | "insurance.monthly_outflow"
  // Cashflow
  | "cashflow.inflow"
  | "cashflow.outflow"
  | "cashflow.savings_rate"
  // Bank
  | "bank.balance_forecast"
  | "bank.ocbc360_conditions"
  // Investments
  | "ilp.fund_value_manual"
  | "investments.portfolio_value"
  | "investments.allocation_pct"

// ---------------------------------------------------------------------------
// Dashboard page labels (for grouping in the confirmation dialog)
// ---------------------------------------------------------------------------

export type DashboardPage =
  | "Tax"
  | "CPF"
  | "Loans"
  | "Insurance"
  | "Cashflow"
  | "Banks"
  | "Investments"
  | "Settings"

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export interface ImpactNode {
  id: ImpactNodeId
  label: string
  page: DashboardPage
  section: string
  /** Whether a user can manually override this value */
  overridable: boolean
  /** Tooltip text shown when value source is "auto" */
  autoTooltip: string
  /** Tooltip text shown when value source is "manual" */
  manualTooltip: string
}

// ---------------------------------------------------------------------------
// Node registry
// ---------------------------------------------------------------------------

export const IMPACT_NODES: Record<ImpactNodeId, ImpactNode> = {
  // Income
  "income.annual_salary": {
    id: "income.annual_salary",
    label: "Annual Salary",
    page: "Settings",
    section: "Income",
    overridable: false,
    autoTooltip: "",
    manualTooltip: "Entered in Settings → Income",
  },
  "income.bonus": {
    id: "income.bonus",
    label: "Bonus Estimate",
    page: "Settings",
    section: "Income",
    overridable: false,
    autoTooltip: "Solved from monthly tax provision",
    manualTooltip: "Entered in Settings → Income",
  },

  // Tax
  "tax.estimated": {
    id: "tax.estimated",
    label: "Estimated Tax",
    page: "Tax",
    section: "Overview",
    overridable: false,
    autoTooltip: "Calculated from income, reliefs, and tax brackets",
    manualTooltip: "",
  },
  "tax.monthly_provision": {
    id: "tax.monthly_provision",
    label: "Monthly Tax Provision",
    page: "Tax",
    section: "Overview",
    overridable: true,
    autoTooltip: "Estimated tax ÷ 12",
    manualTooltip: "Manually entered tax provision",
  },
  "tax.reliefs_manual": {
    id: "tax.reliefs_manual",
    label: "Tax Reliefs",
    page: "Tax",
    section: "Reliefs",
    overridable: false,
    autoTooltip: "",
    manualTooltip: "Entered on Tax page",
  },

  // CPF
  "cpf.balance_manual": {
    id: "cpf.balance_manual",
    label: "CPF Balance",
    page: "CPF",
    section: "Overview",
    overridable: false,
    autoTooltip: "Projected from income and CPF contribution rates",
    manualTooltip: "Entered in Settings → CPF",
  },
  "cpf.projections": {
    id: "cpf.projections",
    label: "CPF Projections",
    page: "CPF",
    section: "Retirement",
    overridable: false,
    autoTooltip: "Projected from current balance, income, and contribution rates",
    manualTooltip: "",
  },
  "cpf.retirement_gap": {
    id: "cpf.retirement_gap",
    label: "Retirement Gap",
    page: "CPF",
    section: "Retirement",
    overridable: false,
    autoTooltip: "Gap between projected CPF and BRS/FRS/ERS targets",
    manualTooltip: "",
  },
  "cpf.housing_deductions": {
    id: "cpf.housing_deductions",
    label: "CPF Housing Deductions",
    page: "CPF",
    section: "Housing",
    overridable: false,
    autoTooltip: "Calculated from active housing loans using CPF OA",
    manualTooltip: "",
  },

  // Loans
  "loan.details": {
    id: "loan.details",
    label: "Loan Details",
    page: "Loans",
    section: "Overview",
    overridable: false,
    autoTooltip: "",
    manualTooltip: "Entered on Loans page",
  },
  "loan.monthly_payment": {
    id: "loan.monthly_payment",
    label: "Monthly Payment",
    page: "Loans",
    section: "Overview",
    overridable: false,
    autoTooltip: "Calculated from principal, rate, and tenure",
    manualTooltip: "",
  },
  "loan.outstanding": {
    id: "loan.outstanding",
    label: "Outstanding Balance",
    page: "Loans",
    section: "Overview",
    overridable: false,
    autoTooltip: "Calculated from principal minus repayments",
    manualTooltip: "",
  },
  "loan.prepayment_savings": {
    id: "loan.prepayment_savings",
    label: "Prepayment Savings",
    page: "Loans",
    section: "Prepayment Calculator",
    overridable: false,
    autoTooltip: "Interest saved by prepaying, net of penalties",
    manualTooltip: "",
  },

  // Insurance
  "insurance.policies": {
    id: "insurance.policies",
    label: "Insurance Policies",
    page: "Insurance",
    section: "Policies",
    overridable: false,
    autoTooltip: "",
    manualTooltip: "Entered in Settings → Insurance",
  },
  "insurance.coverage_score": {
    id: "insurance.coverage_score",
    label: "Coverage Score",
    page: "Insurance",
    section: "Overview",
    overridable: false,
    autoTooltip: "Calculated from active policies vs benchmarks",
    manualTooltip: "",
  },
  "insurance.coverage_gaps": {
    id: "insurance.coverage_gaps",
    label: "Coverage Gaps",
    page: "Insurance",
    section: "Coverage",
    overridable: false,
    autoTooltip: "Benchmarks based on income, age, and dependents",
    manualTooltip: "",
  },
  "insurance.monthly_outflow": {
    id: "insurance.monthly_outflow",
    label: "Insurance Premiums",
    page: "Insurance",
    section: "Overview",
    overridable: false,
    autoTooltip: "Sum of active policy premiums",
    manualTooltip: "",
  },

  // Cashflow
  "cashflow.inflow": {
    id: "cashflow.inflow",
    label: "Monthly Inflow",
    page: "Cashflow",
    section: "Overview",
    overridable: false,
    autoTooltip: "",
    manualTooltip: "Entered in Settings or Cashflow page",
  },
  "cashflow.outflow": {
    id: "cashflow.outflow",
    label: "Monthly Outflow",
    page: "Cashflow",
    section: "Overview",
    overridable: false,
    autoTooltip: "",
    manualTooltip: "Entered in Settings or Cashflow page",
  },
  "cashflow.savings_rate": {
    id: "cashflow.savings_rate",
    label: "Savings Rate",
    page: "Cashflow",
    section: "Overview",
    overridable: false,
    autoTooltip: "Calculated as (inflow − outflow) ÷ inflow",
    manualTooltip: "",
  },

  // Bank
  "bank.balance_forecast": {
    id: "bank.balance_forecast",
    label: "Balance Forecast",
    page: "Banks",
    section: "Overview",
    overridable: false,
    autoTooltip: "Projected from cashflow, GIRO rules, and reconciliation",
    manualTooltip: "",
  },
  "bank.ocbc360_conditions": {
    id: "bank.ocbc360_conditions",
    label: "OCBC 360 Interest",
    page: "Banks",
    section: "OCBC 360",
    overridable: false,
    autoTooltip: "Calculated from balance and category conditions met",
    manualTooltip: "",
  },

  // Investments
  "ilp.fund_value_manual": {
    id: "ilp.fund_value_manual",
    label: "ILP Fund Value",
    page: "Investments",
    section: "ILP",
    overridable: false,
    autoTooltip: "",
    manualTooltip: "Uploaded from fund report",
  },
  "investments.portfolio_value": {
    id: "investments.portfolio_value",
    label: "Portfolio Value",
    page: "Investments",
    section: "Holdings",
    overridable: false,
    autoTooltip: "Sum of holdings × current market prices",
    manualTooltip: "",
  },
  "investments.allocation_pct": {
    id: "investments.allocation_pct",
    label: "Allocation %",
    page: "Investments",
    section: "Allocation",
    overridable: false,
    autoTooltip: "Each holding's value ÷ total portfolio value",
    manualTooltip: "",
  },
}

// ---------------------------------------------------------------------------
// Edge definitions (directed: from → to)
// ---------------------------------------------------------------------------

export interface ImpactEdge {
  from: ImpactNodeId
  to: ImpactNodeId
}

export const IMPACT_EDGES: ImpactEdge[] = [
  // Income cascades
  { from: "income.annual_salary", to: "tax.estimated" },
  { from: "income.annual_salary", to: "cpf.projections" },
  { from: "income.annual_salary", to: "insurance.coverage_gaps" },
  { from: "income.annual_salary", to: "tax.monthly_provision" },
  { from: "income.bonus", to: "tax.estimated" },

  // Tax cascades
  { from: "tax.reliefs_manual", to: "tax.estimated" },
  { from: "tax.estimated", to: "tax.monthly_provision" },
  { from: "tax.estimated", to: "cashflow.outflow" },

  // CPF cascades
  { from: "cpf.balance_manual", to: "cpf.projections" },
  { from: "cpf.balance_manual", to: "cpf.retirement_gap" },
  { from: "cpf.projections", to: "cpf.retirement_gap" },

  // Loan cascades
  { from: "loan.details", to: "loan.monthly_payment" },
  { from: "loan.details", to: "loan.outstanding" },
  { from: "loan.details", to: "loan.prepayment_savings" },
  { from: "loan.details", to: "cpf.housing_deductions" },
  { from: "loan.monthly_payment", to: "cashflow.outflow" },

  // Insurance cascades
  { from: "insurance.policies", to: "insurance.coverage_score" },
  { from: "insurance.policies", to: "insurance.coverage_gaps" },
  { from: "insurance.policies", to: "insurance.monthly_outflow" },
  { from: "insurance.monthly_outflow", to: "cashflow.outflow" },

  // Cashflow cascades
  { from: "cashflow.inflow", to: "bank.balance_forecast" },
  { from: "cashflow.inflow", to: "cashflow.savings_rate" },
  { from: "cashflow.outflow", to: "bank.balance_forecast" },
  { from: "cashflow.outflow", to: "bank.ocbc360_conditions" },
  { from: "cashflow.outflow", to: "cashflow.savings_rate" },

  // Investment cascades
  { from: "ilp.fund_value_manual", to: "investments.portfolio_value" },
  { from: "ilp.fund_value_manual", to: "investments.allocation_pct" },
]

// ---------------------------------------------------------------------------
// Graph traversal helpers
// ---------------------------------------------------------------------------

/** BFS to collect all transitively downstream nodes from a source */
export function getDownstreamImpacts(sourceId: ImpactNodeId): ImpactNode[] {
  const visited = new Set<ImpactNodeId>()
  const queue: ImpactNodeId[] = []

  // Seed with direct children
  for (const edge of IMPACT_EDGES) {
    if (edge.from === sourceId && !visited.has(edge.to)) {
      visited.add(edge.to)
      queue.push(edge.to)
    }
  }

  // BFS
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of IMPACT_EDGES) {
      if (edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to)
        queue.push(edge.to)
      }
    }
  }

  return Array.from(visited).map((id) => IMPACT_NODES[id])
}

/** Group downstream impacts by dashboard page */
export function getImpactsByPage(
  sourceId: ImpactNodeId,
): Map<DashboardPage, ImpactNode[]> {
  const impacts = getDownstreamImpacts(sourceId)
  const grouped = new Map<DashboardPage, ImpactNode[]>()

  for (const node of impacts) {
    const existing = grouped.get(node.page)
    if (existing) {
      existing.push(node)
    } else {
      grouped.set(node.page, [node])
    }
  }

  return grouped
}

/** Check if a node has any downstream impacts */
export function hasDownstreamImpacts(nodeId: ImpactNodeId): boolean {
  return IMPACT_EDGES.some((edge) => edge.from === nodeId)
}
