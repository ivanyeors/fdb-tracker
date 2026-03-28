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
      "Investments use live prices (FMP); ILP uses last entered fund value.",
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
    label: "Estimated tax (total)",
    logic:
      "Per profile: employment income \u2212 reliefs (cap $80k) = chargeable income; progressive resident tax; minus any YA rebate modelled.",
    explanation: "Sum of estimated tax payable for the year of assessment shown.",
    details:
      "Compare each profile\u2019s estimate with IRAS actual. Reliefs auto-derived where possible; rest under Manual reliefs.",
  },
  TAX_ESTIMATED_PAYABLE: {
    label: "Estimated tax payable",
    logic:
      "Salary + bonus \u2212 reliefs (max $80k) = chargeable income. Tax = Singapore resident progressive brackets. Then YA rebate if built into the model.",
    explanation: "What the app thinks you owe before comparing to IRAS.",
    details:
      "Not a Notice of Assessment. Enter your IRAS figure to track variance. Missing income in settings hides the bracket ladder.",
  },
  TAX_FROM_MONTHLY: {
    label: "Tax from monthly instalment",
    logic:
      "Implied annual tax = monthly amount \u00d7 number of payments (default 12). Optionally solves bonus estimate so the model\u2019s tax matches that total.",
    explanation: "Back-solve from GIRO-style instalments when you do not have the full IRAS figure handy.",
    details:
      "Assumes equal instalments; IRAS schedules, lump sums, or interest may differ. If sync is on, only bonus estimate changes under Settings \u2192 Users; salary and manual reliefs stay fixed. If the target tax is below what the model allows at zero bonus, reduce salary or add reliefs first.",
  },
  TAX_PROGRESSIVE_BRACKETS: {
    label: "Progressive tax brackets",
    logic:
      "Chargeable income is split into slices: first slice at 0%, next at 2%, then higher rates on higher slices (YA 2024+ resident table).",
    explanation: "Bar width shows how much of your chargeable income sits in each rate band.",
    details:
      "Marginal rate is the rate on your top slice. Lower chargeable income (e.g. more reliefs under the cap) shifts dollars left into lower bands.",
  },
  TAX_RELIEF_BY_CATEGORY: {
    label: "Relief mix",
    logic: "Each slice is one relief type\u2019s share of total relief dollars stored for the year.",
    explanation: "Shows composition of reliefs, not tax owed.",
    details:
      "Combined across household members when multiple profiles share this view. Amounts feed the $80k cap in the tax engine.",
  },
  TAX_REBATE_YA: {
    label: "Tax rebate (YA-specific)",
    logic:
      "In this app, only certain years have a rebate rule wired in (e.g. YA 2025: 60% of tax before rebate, capped at $200).",
    explanation:
      "Rebate reduces tax after progressive brackets. IRAS announces rebates per year; other YAs may show $0 until the model is updated.",
    details:
      "Always compare final tax to your IRAS Notice of Assessment — rebates and rules can change.",
  },
  TAX_NEXT_YA_ILLUSTRATIVE: {
    label: "Next YA (illustrative)",
    logic:
      "Same salary, bonus, and manual relief entries as for the selected YA are run through the model for YA = selected + 1 (age/CPF/rebate rules may differ).",
    explanation:
      "Not a forecast of your next calendar year\u2019s pay. IRAS taxes prior-year income per YA; real figures depend on actual income and reliefs for that basis period.",
    details:
      "Use per-person tax cards below for the full ladder. Compare estimates to your IRAS notices when filed.",
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
  CPF_DPS: {
    label: "Dependants' Protection Scheme (DPS)",
    logic:
      "Estimated annual premium by age band, spread monthly in OA projections (CPF deducts from OA/SA per Board rules).",
    explanation:
      "Term-style cover for death, terminal illness, and TPD. Not a bank outflow.",
    details:
      "Rates follow published schedules — verify on your CPF statement. Turn off in User Settings if you opted out of DPS.",
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
      "Assumes income growth ~3% p.a., CPF interest OA 2.5%/SA 4%/MA 4%. Optional DPS premium spread reduces OA when enabled in settings. Retirement sums increase ~3.5% p.a.",
  },
  GOAL_PROGRESS: {
    label: "Goal Progress",
    logic: "current_amount / target_amount \u00d7 100",
    explanation: "Percentage of savings goal reached.",
    details:
      "Contributions from dashboard or Telegram /goaladd command.",
  },
  INVESTMENT_COST_PER_UNIT: {
    label: "Cost per unit",
    logic:
      "Average price you paid for one unit (share, gram, etc.). After more buys, this becomes your weighted average.",
    explanation:
      "Profit or loss compares current price to this value, times the number of units.",
    details:
      "Same meaning as “Cost per unit” when adding a holding; buy commands update it automatically.",
  },
  INVESTMENT_PNL: {
    label: "Investment P&L",
    logic: "(current_price \u00d7 units) \u2212 cost_basis",
    explanation: "Unrealized gain or loss on holdings.",
    details:
      "Live quotes are in USD (OCBC metals and FMP stocks/ETFs, with FX). Cost basis is stored in SGD per unit and converted to USD for P&L.",
  },
  GOLD_SILVER_VALUE: {
    label: "Gold/Silver Value",
    logic: "units \u00d7 OCBC indicative sell price (converted from SGD to US$ for display)",
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
  INSURANCE_COVERAGE_SCORE: {
    label: "Coverage Score",
    logic:
      "Weighted average across death (30%), CI (25%), hospitalization (25%), disability (15%), PA (5%).",
    explanation:
      "100 = fully covered per LIA Singapore benchmarks.",
    details:
      "Each category scored as min(held/needed, 1) × 100. Hospitalization and PA scored as 0 or 100 based on active policy.",
  },
  SEASONALITY_PROMPTS: {
    label: "Market Seasonality",
    logic:
      "Date-matched events from an annual seasonality calendar (earnings, options expiry, macro windows, entry windows).",
    explanation:
      "Contextual market awareness prompts based on historical seasonal patterns that recur every year.",
    details:
      "Risk events highlight periods of historically elevated volatility. Opportunity windows indicate historically favorable entry points for long positions.",
  },
  PRIMARY_BANK_ACCOUNT: {
    label: "Primary Bank Account",
    logic:
      "Inflow is deposited here. Discretionary outflow and fixed costs are deducted from this account unless assigned elsewhere.",
    explanation:
      "Select the bank account that receives your salary. Other accounts only receive GIRO transfers.",
    details:
      "When you record inflow via Telegram /in or the dashboard, the amount is attributed to this account for balance computation. Insurance, loan, and ILP deductions default to this account unless a specific deduction account is set.",
  },
} as const satisfies Record<string, TooltipEntry>
