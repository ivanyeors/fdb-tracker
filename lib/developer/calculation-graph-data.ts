export type GraphNodeType =
  | "bank"
  | "loan"
  | "cpf"
  | "investment"
  | "tax"
  | "cashflow"
  | "insurance"
  | "goal"

export type CalcGraphNode = {
  id: string
  label: string
  type: GraphNodeType
  filePath: string
}

export type CalcGraphLink = {
  source: string
  target: string
  calculationName: string
  description: string
  filePath: string
}

export const GRAPH_NODES: CalcGraphNode[] = [
  {
    id: "income",
    label: "Income",
    type: "cashflow",
    filePath: "lib/calculations/take-home.ts",
  },
  {
    id: "cpf_alloc",
    label: "CPF Allocation",
    type: "cpf",
    filePath: "lib/calculations/cpf.ts",
  },
  {
    id: "cpf_balance",
    label: "CPF Balances",
    type: "cpf",
    filePath: "lib/calculations/cpf.ts",
  },
  {
    id: "cpf_retirement",
    label: "CPF Retirement",
    type: "cpf",
    filePath: "lib/calculations/cpf-retirement.ts",
  },
  {
    id: "cpf_housing",
    label: "CPF Housing",
    type: "cpf",
    filePath: "lib/calculations/cpf-housing.ts",
  },
  {
    id: "bank_balance",
    label: "Bank Balance",
    type: "bank",
    filePath: "lib/calculations/bank-interest.ts",
  },
  {
    id: "ocbc360",
    label: "OCBC 360 Interest",
    type: "bank",
    filePath: "lib/calculations/ocbc360-status.ts",
  },
  {
    id: "bank_forecast",
    label: "Balance Forecast",
    type: "bank",
    filePath: "lib/calculations/balance-forecast.ts",
  },
  {
    id: "loan_principal",
    label: "Loan Principal",
    type: "loan",
    filePath: "lib/calculations/loans.ts",
  },
  {
    id: "loan_monthly",
    label: "Monthly Payment",
    type: "loan",
    filePath: "lib/calculations/loans.ts",
  },
  {
    id: "loan_outstanding",
    label: "Outstanding Balance",
    type: "loan",
    filePath: "lib/calculations/loans.ts",
  },
  {
    id: "early_repayment",
    label: "Early Repayment",
    type: "loan",
    filePath: "lib/calculations/loans.ts",
  },
  {
    id: "tax_income",
    label: "Employment Income",
    type: "tax",
    filePath: "lib/calculations/tax.ts",
  },
  {
    id: "tax_reliefs",
    label: "Tax Reliefs",
    type: "tax",
    filePath: "lib/calculations/tax-reliefs.ts",
  },
  {
    id: "tax_payable",
    label: "Tax Payable",
    type: "tax",
    filePath: "lib/calculations/tax.ts",
  },
  {
    id: "cashflow_in",
    label: "Monthly Inflow",
    type: "cashflow",
    filePath: "lib/calculations/outflow.ts",
  },
  {
    id: "cashflow_out",
    label: "Monthly Outflow",
    type: "cashflow",
    filePath: "lib/calculations/outflow.ts",
  },
  {
    id: "ilp_premium",
    label: "ILP Premium",
    type: "investment",
    filePath: "lib/investments/ilp-premium-derive.ts",
  },
  {
    id: "ilp_value",
    label: "ILP Fund Value",
    type: "investment",
    filePath: "lib/investments/ilp-group-summary.ts",
  },
  {
    id: "investments",
    label: "Holdings",
    type: "investment",
    filePath: "lib/calculations/investments.ts",
  },
  {
    id: "insurance_premium",
    label: "Insurance Premium",
    type: "insurance",
    filePath: "lib/calculations/insurance-premium.ts",
  },
  {
    id: "insurance_coverage",
    label: "Coverage Needs",
    type: "insurance",
    filePath: "lib/calculations/insurance.ts",
  },
  {
    id: "savings_goals",
    label: "Savings Goals",
    type: "goal",
    filePath: "lib/calculations/savings-goals.ts",
  },
  {
    id: "take_home",
    label: "Take-Home Pay",
    type: "cashflow",
    filePath: "lib/calculations/take-home.ts",
  },
]

export const GRAPH_LINKS: CalcGraphLink[] = [
  {
    source: "income",
    target: "cpf_alloc",
    calculationName: "CPF Contribution",
    description:
      "Employee + employer CPF rates applied to gross salary to derive monthly contributions per account (OA/SA/MA).",
    filePath: "lib/calculations/cpf.ts",
  },
  {
    source: "cpf_alloc",
    target: "cpf_balance",
    calculationName: "CPF Accumulation",
    description:
      "Monthly contributions accumulate into CPF account balances, with interest compounding annually.",
    filePath: "lib/calculations/cpf.ts",
  },
  {
    source: "cpf_balance",
    target: "cpf_retirement",
    calculationName: "Retirement Projection",
    description:
      "Projects CPF balances forward to retirement age using contribution rates and interest.",
    filePath: "lib/calculations/cpf-retirement.ts",
  },
  {
    source: "cpf_balance",
    target: "cpf_housing",
    calculationName: "Housing Usage",
    description:
      "CPF OA withdrawals for housing reduce OA balance and accrue interest for refund calculation.",
    filePath: "lib/calculations/cpf-housing.ts",
  },
  {
    source: "cpf_housing",
    target: "loan_monthly",
    calculationName: "CPF OA Deduction",
    description:
      "CPF OA allocated to monthly loan repayment, reducing cash outflow needed.",
    filePath: "lib/calculations/loans.ts",
  },
  {
    source: "income",
    target: "tax_income",
    calculationName: "Employment Income",
    description:
      "Annual salary + bonus forms the base employment income for tax calculation.",
    filePath: "lib/calculations/tax.ts",
  },
  {
    source: "cpf_alloc",
    target: "tax_reliefs",
    calculationName: "CPF Relief",
    description:
      "Employee CPF contributions qualify as automatic tax relief.",
    filePath: "lib/calculations/tax-reliefs.ts",
  },
  {
    source: "insurance_premium",
    target: "tax_reliefs",
    calculationName: "Life Insurance Relief",
    description:
      "Life insurance premiums qualify for tax relief, capped at $5,000 minus CPF relief.",
    filePath: "lib/calculations/tax-reliefs.ts",
  },
  {
    source: "tax_income",
    target: "tax_payable",
    calculationName: "Progressive Tax",
    description:
      "Chargeable income (employment income minus reliefs) taxed using Singapore progressive brackets.",
    filePath: "lib/calculations/tax.ts",
  },
  {
    source: "tax_reliefs",
    target: "tax_payable",
    calculationName: "Relief Deduction",
    description:
      "Total reliefs (capped at $80k) reduce chargeable income before applying tax brackets.",
    filePath: "lib/calculations/tax.ts",
  },
  {
    source: "income",
    target: "take_home",
    calculationName: "Net Pay",
    description:
      "Gross salary minus CPF employee contribution and estimated tax gives take-home pay.",
    filePath: "lib/calculations/take-home.ts",
  },
  {
    source: "take_home",
    target: "cashflow_in",
    calculationName: "Monthly Inflow",
    description:
      "Take-home pay is the primary monthly inflow for cashflow tracking.",
    filePath: "lib/calculations/outflow.ts",
  },
  {
    source: "cashflow_out",
    target: "ocbc360",
    calculationName: "Spend Condition",
    description:
      "Monthly discretionary outflow tracked against OCBC 360 spend threshold ($500/mth).",
    filePath: "lib/calculations/ocbc360-status.ts",
  },
  {
    source: "cashflow_in",
    target: "ocbc360",
    calculationName: "Salary Condition",
    description:
      "Monthly salary inflow tracked against OCBC 360 salary credit threshold ($1,800/mth).",
    filePath: "lib/calculations/ocbc360-status.ts",
  },
  {
    source: "bank_balance",
    target: "ocbc360",
    calculationName: "Interest Calc",
    description:
      "OCBC 360 tiered interest calculated on balance with stacked category bonus rates.",
    filePath: "lib/calculations/bank-interest.ts",
  },
  {
    source: "ocbc360",
    target: "bank_forecast",
    calculationName: "Balance Projection",
    description:
      "Projected interest from OCBC 360 feeds into 6-month balance forecast.",
    filePath: "lib/calculations/balance-forecast.ts",
  },
  {
    source: "cashflow_in",
    target: "bank_forecast",
    calculationName: "Inflow Projection",
    description:
      "Monthly inflow used in balance forecast to project future balances.",
    filePath: "lib/calculations/balance-forecast.ts",
  },
  {
    source: "cashflow_out",
    target: "bank_forecast",
    calculationName: "Outflow Projection",
    description:
      "Monthly outflow deducted in balance forecast projection.",
    filePath: "lib/calculations/balance-forecast.ts",
  },
  {
    source: "loan_principal",
    target: "loan_monthly",
    calculationName: "Amortization",
    description:
      "Standard amortization formula: principal, rate, and tenure determine monthly payment.",
    filePath: "lib/calculations/loans.ts",
  },
  {
    source: "loan_principal",
    target: "loan_outstanding",
    calculationName: "Balance Tracking",
    description:
      "Outstanding balance computed by replaying all repayment events against original principal.",
    filePath: "lib/calculations/loans.ts",
  },
  {
    source: "early_repayment",
    target: "loan_outstanding",
    calculationName: "Principal Reduction",
    description:
      "Early repayments reduce principal directly, saving interest over remaining tenure.",
    filePath: "lib/calculations/loans.ts",
  },
  {
    source: "loan_monthly",
    target: "cashflow_out",
    calculationName: "Loan Deduction",
    description:
      "Monthly loan repayment is a recurring outflow in cashflow tracking.",
    filePath: "lib/calculations/outflow.ts",
  },
  {
    source: "ilp_premium",
    target: "cashflow_out",
    calculationName: "Premium Outflow",
    description: "ILP monthly premiums contribute to total monthly outflow.",
    filePath: "lib/investments/ilp-premium-derive.ts",
  },
  {
    source: "ilp_premium",
    target: "ilp_value",
    calculationName: "Fund Accumulation",
    description:
      "Premiums allocated by % to individual ILP funds accumulate into fund values.",
    filePath: "lib/investments/ilp-group-summary.ts",
  },
  {
    source: "insurance_premium",
    target: "cashflow_out",
    calculationName: "Premium Outflow",
    description: "Insurance premiums contribute to monthly outflow.",
    filePath: "lib/calculations/insurance-premium.ts",
  },
  {
    source: "income",
    target: "insurance_coverage",
    calculationName: "Needs Analysis",
    description:
      "Income determines required coverage levels for life, CI, and disability insurance.",
    filePath: "lib/calculations/insurance.ts",
  },
  {
    source: "bank_balance",
    target: "savings_goals",
    calculationName: "Goal Progress",
    description:
      "Bank balances contribute to savings goal progress tracking.",
    filePath: "lib/calculations/savings-goals.ts",
  },
  {
    source: "investments",
    target: "savings_goals",
    calculationName: "Investment Value",
    description:
      "Investment portfolio value contributes to net worth and savings goals.",
    filePath: "lib/calculations/savings-goals.ts",
  },
]

export const NODE_COLORS: Record<GraphNodeType, string> = {
  bank: "#3b82f6", // blue-500
  loan: "#ef4444", // red-500
  cpf: "#8b5cf6", // violet-500
  investment: "#10b981", // emerald-500
  tax: "#f59e0b", // amber-500
  cashflow: "#06b6d4", // cyan-500
  insurance: "#ec4899", // pink-500
  goal: "#84cc16", // lime-500
}
