export type TooltipEntry = {
  label: string
  logic: string
  explanation: string
  details: string
}

export const TOOLTIPS = {
  NET_WORTH: {
    label: "Net Worth",
    logic:
      "Banks + Investments + ILP \u2212 Loans. CPF shown separately (locked/retirement).",
    explanation: "Total assets minus liabilities.",
    details:
      "Investments use live prices (Eulerpool); ILP uses last entered fund value.",
  },
  LIQUID_NET_WORTH: {
    label: "Liquid Net Worth",
    logic: "Banks + Investments + ILP \u2212 Loans. Excludes CPF.",
    explanation: "Assets you can access freely, minus liabilities.",
    details: "CPF is locked/retirement funds, not freely accessible.",
  },
  SAVINGS_RATE: {
    label: "Savings Rate",
    logic: "(Inflow \u2212 Effective outflow) / Inflow \u00d7 100",
    explanation: "Percentage of income saved each month.",
    details:
      "Effective outflow includes auto-deducted insurance, ILP, loans. Stock trades excluded (asset exchange).",
  },
  BANK_BALANCE: {
    label: "Bank Balance",
    logic: "Opening balance + Inflow \u2212 Effective outflow",
    explanation: "Derived from cashflow; no manual entry needed.",
    details:
      "Opening = previous month closing; manual seed for first month. Effective outflow = discretionary + insurance + ILP + loans.",
  },
  BANK_INTEREST_OCBC360: {
    label: "OCBC 360 Interest",
    logic:
      "Tiered rates across 7 categories (Base, Salary, Save, Spend, Insure, Invest, Grow)",
    explanation:
      "Each category has a qualifying requirement for bonus interest.",
    details:
      "Salary = inflow \u2265 $1,800; Save = balance increase \u2265 $500; Insure/Invest = configurable in Settings.",
  },
  CPF_OA_SA_MA: {
    label: "CPF OA/SA/MA",
    logic:
      "Auto from income using allocation by age. 2026: \u226435 = 47.59% OA, 12.41% SA, 40% MA.",
    explanation:
      "Employer + employee contributions split across three accounts.",
    details:
      "Ceilings: OW $8,000/mth (2026), AW $102k \u2212 YTD OW. OA earns 2.5%, SA/MA earn 4%.",
  },
  INSURANCE_DEDUCT: {
    label: "Insurance Deduction",
    logic:
      "Active policies with deduct_from_outflow add monthly equivalent to effective outflow.",
    explanation: "Money leaves bank account for insurance premiums.",
    details:
      "Yearly premium / 12 for monthly equivalent; age-based premiums may change yearly.",
  },
  INSURANCE_GAP: {
    label: "Insurance Coverage Gap",
    logic:
      "Death: 9\u201310\u00d7 annual income. CI: 4\u00d7 annual income. Hospitalization: active ISP. Disability: 75% monthly salary.",
    explanation: "Based on LIA Singapore protection gap benchmarks.",
    details:
      "74% of Singaporeans have a critical illness coverage gap.",
  },
  TAX_CALCULATED: {
    label: "Tax Calculated",
    logic:
      "Employment income \u2212 reliefs (cap $80k) = chargeable income \u2192 progressive rates \u2212 rebate.",
    explanation: "Singapore resident tax, auto-derived where possible.",
    details:
      "Reliefs auto-derived: earned income, CPF, SRS, life insurance, NSman. Remaining entered manually.",
  },
  TAX_RELIEF_INPUTS: {
    label: "Tax Relief Inputs",
    logic: "Per relief: limit and where money flows.",
    explanation:
      "SRS: $15,300 \u2192 SRS account. CPF top-up: $8k own + $8k family \u2192 CPF SA/RA.",
    details: "Overall cap: $80,000 per year across all reliefs.",
  },
  LOAN_INTEREST_SAVED: {
    label: "Interest Saved",
    logic:
      "Compare amortization schedules with vs without early repayment.",
    explanation: "Interest offset by reducing principal earlier.",
    details: "Depends on loan rate and remaining tenure.",
  },
  CPF_HOUSING_REFUND: {
    label: "CPF Housing Refund",
    logic:
      "Principal withdrawn + accrued interest (2.5% p.a. compounded monthly).",
    explanation:
      "Must refund on property sale to restore retirement savings.",
    details:
      "120% Valuation Limit cap; voluntary refund reduces future accrued interest.",
  },
  CPF_BRS: {
    label: "Basic Retirement Sum (BRS)",
    logic: "Minimum CPF to set aside at age 55 before further housing use.",
    explanation:
      "Official Singapore benchmark. Property with lease to age 95+ can be pledged to meet BRS.",
    details:
      "2026 cohort: $110,200. CPF LIFE payout ~$890–$930/mth at BRS.",
  },
  CPF_FRS: {
    label: "Full Retirement Sum (FRS)",
    logic: "2× BRS. Higher target for retirement adequacy.",
    explanation:
      "Official Singapore benchmark. Standard target for CPF LIFE payouts.",
    details:
      "2026 cohort: $220,400. CPF LIFE payout ~$1,640–$1,750/mth at FRS.",
  },
  CPF_ERS: {
    label: "Enhanced Retirement Sum (ERS)",
    logic: "2× FRS. Maximum top-up target.",
    explanation:
      "Official Singapore benchmark. Highest retirement savings target.",
    details:
      "2026 cohort: $440,800. CPF LIFE payout ~$3,180–$3,410/mth at ERS.",
  },
  CPF_RETIREMENT_PROJECTION: {
    label: "CPF Growth Projection",
    logic:
      "Projected OA+SA+MA over time using income, contribution rates, and interest.",
    explanation:
      "Horizontal lines show BRS/FRS/ERS benchmarks. See when your projection crosses each target.",
    details:
      "Assumes income growth ~3% p.a., CPF interest OA 2.5%/SA 4%/MA 4%. Retirement sums increase ~3.5% p.a.",
  },
  GOAL_PROGRESS: {
    label: "Goal Progress",
    logic: "current_amount / target_amount \u00d7 100",
    explanation: "Percentage of savings goal reached.",
    details:
      "Contributions from dashboard or Telegram /goaladd command.",
  },
  INVESTMENT_PNL: {
    label: "Investment P&L",
    logic: "(current_price \u00d7 units) \u2212 cost_basis",
    explanation: "Unrealized gain or loss on holdings.",
    details:
      "Prices from Eulerpool API; cost_basis from buy transactions.",
  },
  GOLD_SILVER_VALUE: {
    label: "Gold/Silver Value",
    logic: "units \u00d7 OCBC indicative sell price (SGD)",
    explanation: "Conservative mark-to-market using sell price.",
    details:
      "Uses OCBC\u2019s sell price since holdings are in OCBC Precious Metals Account.",
  },
  OCBC_360_INSURE_INVEST: {
    label: "OCBC 360 Insure/Invest",
    logic:
      "Insure: qualifying OCBC insurance (endowment \u2265$4k, whole life \u2265$8k, protection \u2265$2k). Invest: unit trusts \u2265$20k, structured deposits \u2265$20k.",
    explanation:
      "Toggle off in Settings if not yet qualified.",
    details:
      "Enables/disables the Insure and Invest bonus interest tiers.",
  },
  COMBINED_BANK_BALANCE: {
    label: "Combined Bank Balance",
    logic: "Sum of derived/actual balances per account",
    explanation: "Total across all bank accounts.",
    details:
      "Each account balance derived from its own cashflow.",
  },
} as const satisfies Record<string, TooltipEntry>
