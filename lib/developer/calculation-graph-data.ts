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
  calculationLogic: string
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
    filePath: "lib/api/effective-inflow.ts",
  },
  {
    id: "cashflow_out",
    label: "Monthly Outflow",
    type: "cashflow",
    filePath: "lib/api/effective-outflow.ts",
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
  {
    id: "ilp_one_time",
    label: "ILP One-Time",
    type: "investment",
    filePath: "lib/api/effective-outflow.ts",
  },
  {
    id: "tax_relief_cash",
    label: "SRS/CPF Top-ups",
    type: "tax",
    filePath: "lib/api/effective-outflow.ts",
  },
  {
    id: "dividends",
    label: "Dividends",
    type: "investment",
    filePath: "lib/api/effective-inflow.ts",
  },
  {
    id: "investment_purchases",
    label: "Investment Purchases",
    type: "investment",
    filePath: "lib/api/effective-outflow.ts",
  },
  {
    id: "bank_interest",
    label: "Bank Interest",
    type: "bank",
    filePath: "lib/api/effective-inflow.ts",
  },
  {
    id: "giro_transfers",
    label: "GIRO Transfers",
    type: "cashflow",
    filePath: "lib/api/giro-amounts.ts",
  },
  {
    id: "cpf_healthcare",
    label: "Healthcare MA Deductions",
    type: "cpf",
    filePath: "lib/calculations/cpf-healthcare.ts",
  },
  {
    id: "tax_giro",
    label: "Tax GIRO Schedule",
    type: "tax",
    filePath: "lib/calculations/tax-giro.ts",
  },
  {
    id: "dependents",
    label: "Family Dependents",
    type: "tax",
    filePath: "lib/calculations/tax-reliefs.ts",
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
    calculationLogic: `**Formula:**
cpfableWage = min(monthlyGross, owCeiling)
employee = cpfableWage × employeeRate
employer = cpfableWage × employerRate
total = employee + employer

**Rate Brackets (2026):**
Age ≤55: Employee 20%, Employer 17%, Total 37%
Age ≤60: Employee 18%, Employer 16%, Total 34%
Age ≤65: Employee 12.5%, Employer 12.5%, Total 25%
Age ≤70: Employee 7.5%, Employer 9%, Total 16.5%
Age >70: Employee 5%, Employer 7.5%, Total 12.5%

**OW Ceiling:** $8,000/mth (2026), $7,400 (2025)

**Allocation (2026, age ≤35):**
OA 47.59%, SA 12.41%, MA 40%
MA absorbs rounding remainder.`,
  },
  {
    source: "cpf_alloc",
    target: "cpf_balance",
    calculationName: "CPF Accumulation",
    description:
      "Monthly contributions accumulate into CPF account balances, with interest compounding annually.",
    filePath: "lib/calculations/cpf.ts",
    calculationLogic: `**Formula:**
oa += total × allocation.oa
sa += total × allocation.sa
ma += total - oa_contribution - sa_contribution

**Allocation Brackets (2026):**
Age ≤35: OA 47.59%, SA 12.41%, MA 40.00%
Age ≤45: OA 42.87%, SA 14.28%, MA 42.85%
Age ≤50: OA 38.39%, SA 16.16%, MA 45.45%
Age ≤55: OA 30.20%, SA 23.14%, MA 46.66%
Age ≤60: OA 27.25%, SA 26.09%, MA 46.66%
Age ≤65: OA 11.15%, SA 35.01%, MA 53.84%

**Annual Bonus CPF:**
AW Ceiling = $102,000 - (12 × min(salary, owCeiling))
Bonus CPF applies on AW up to the ceiling.`,
  },
  {
    source: "cpf_balance",
    target: "cpf_retirement",
    calculationName: "Retirement Projection",
    description:
      "Projects CPF balances forward to retirement age using contribution rates and interest.",
    filePath: "lib/calculations/cpf-retirement.ts",
    calculationLogic: `**Interest Rates:**
OA: 2.5% p.a.
SA: 4.0% p.a.
MA: 4.0% p.a.

**Extra Interest (1% p.a.):**
On first $60k of combined balances (max $20k from OA)

**Bonus 55+ Interest:**
First $30k: +2% p.a.
Next $30k: +1% p.a.

**Monthly Projection:**
1. Add monthly contribution per account
2. Deduct healthcare premiums from MA (MSL, CSL, ISP via getMonthlyMaDeduction callback)
3. Apply base interest: balance × (1 + rate/12)
4. Add extra interest on qualifying balances
5. If age ≥55, add bonus interest

**Healthcare MA Deduction:**
ma = max(0, ma - monthlyHealthcare)
Applied each month using age-dependent rates from cpf_healthcare_config.

**Retirement Sums (2026):**
BRS: $110,200 (payout ~$890-930/mth)
FRS: $220,400 (payout ~$1,640-1,750/mth)
ERS: $440,800 (payout ~$3,180-3,410/mth)`,
  },
  {
    source: "cpf_balance",
    target: "cpf_housing",
    calculationName: "Housing Usage",
    description:
      "CPF OA withdrawals for housing reduce OA balance and accrue interest for refund calculation.",
    filePath: "lib/calculations/cpf-housing.ts",
    calculationLogic: `**Accrued Interest Formula:**
accruedInterest = P × ((1 + r/12)^months - 1)

Where:
P = withdrawal principal
r = 2.5% p.a. (OA interest rate)
months = calendar months since withdrawal

**Refund Amount:**
totalRefund = sum(principal + accruedInterest) per tranche

**VL 120% Headroom:**
cap = 1.2 × valuationLimit
headroom = max(0, cap - totalCpfPrincipalUsed)`,
  },
  {
    source: "cpf_housing",
    target: "loan_monthly",
    calculationName: "CPF OA Deduction",
    description:
      "CPF OA allocated to monthly loan repayment, reducing cash outflow needed.",
    filePath: "lib/calculations/loans.ts",
    calculationLogic: `**Logic:**
Monthly loan payment can be partially or fully paid from CPF OA.

cashPayment = max(0, monthlyPayment - cpfOaAllocation)

The CPF OA deduction reduces the cash outflow needed for loan servicing. The OA allocation is subject to VL headroom limits.`,
  },
  {
    source: "income",
    target: "tax_income",
    calculationName: "Employment Income",
    description:
      "Annual salary + bonus forms the base employment income for tax calculation.",
    filePath: "lib/calculations/tax.ts",
    calculationLogic: `**Formula:**
employmentIncome = annualSalary + annualBonus

This forms the gross assessable employment income before any reliefs or deductions are applied.

Other income sources (rental, interest, etc.) are added separately if applicable.`,
  },
  {
    source: "cpf_alloc",
    target: "tax_reliefs",
    calculationName: "CPF Relief",
    description: "Employee CPF contributions qualify as automatic tax relief.",
    filePath: "lib/calculations/tax-reliefs.ts",
    calculationLogic: `**Formula:**
cpfRelief = totalEmployeeCpfAnnual

The full employee CPF contribution is automatically deductible as a tax relief. No cap on CPF relief itself, but total reliefs are capped at $80,000.

This is an automatic relief — no claim required.`,
  },
  {
    source: "insurance_premium",
    target: "tax_reliefs",
    calculationName: "Life Insurance Relief",
    description:
      "Life insurance premiums qualify for tax relief, capped at $5,000 minus CPF relief.",
    filePath: "lib/calculations/tax-reliefs.ts",
    calculationLogic: `**Formula:**
capAfterCpf = max(0, $5,000 - cpfReliefAmount)
sevenPctCap = totalInsuredSum × 0.07
effectiveCap = min(capAfterCpf, sevenPctCap)
relief = min(totalLifePremiumAnnual, effectiveCap)

**Key Rules:**
- Only life insurance premiums qualify (not health/travel)
- Combined CPF + life insurance relief capped at $5,000
- If CPF relief ≥ $5,000, life insurance relief = $0
- Further limited to 7% of total insured sum`,
  },
  {
    source: "tax_income",
    target: "tax_payable",
    calculationName: "Progressive Tax",
    description:
      "Chargeable income (employment income minus reliefs) taxed using Singapore progressive brackets.",
    filePath: "lib/calculations/tax.ts",
    calculationLogic: `**Progressive Tax Brackets (YA2024+):**
$0 - $20,000: 0%
$20,001 - $30,000: 2%
$30,001 - $40,000: 3.5%
$40,001 - $80,000: 7%
$80,001 - $120,000: 11.5%
$120,001 - $160,000: 15%
$160,001 - $200,000: 18%
$200,001 - $240,000: 19%
$240,001 - $280,000: 19.5%
$280,001 - $320,000: 20%
$320,001 - $500,000: 22%
$500,001 - $1,000,000: 23%
Above $1,000,000: 24%

**Formula:**
For each bracket: tax += (bandEnd - bandStart) × rate

**YA2025 Rebate:** 60% of tax, capped at $200`,
  },
  {
    source: "tax_reliefs",
    target: "tax_payable",
    calculationName: "Relief Deduction",
    description:
      "Total reliefs (capped at $80k) reduce chargeable income before applying tax brackets.",
    filePath: "lib/calculations/tax.ts",
    calculationLogic: `**Formula:**
totalReliefs = sum(all qualifying reliefs)
cappedReliefs = min(totalReliefs, $80,000)
chargeableIncome = employmentIncome - cappedReliefs

**Available Reliefs:**
- Earned Income: $1,000 (≤54), $6,000 (55-59), $8,000 (60+)
- CPF: Full employee contribution (auto, or manual override from NOA import)
- Life Insurance: Up to $5,000 - CPF relief (auto, or manual override from NOA)
- SRS: Up to $15,300
- NSman: Up to $5,000
- Spouse: $2,000 (auto-derived if married + spouse income < $8,000)
- QCR: Born 2024+: $8k/$10k/$12k by order; pre-2024: $4k; handicapped: $7,500
- WMCR: Born 2024+: fixed $8k/$10k/$12k; older: 15%/20%/25% of mother's income
- Parent: $5,500-$14,000 per parent (max 2, income < $8,000)
- Course Fees: Up to $5,500
- Donations: 250% of amount
- Donations (Employer): Pass-through at deduction value (no 250% multiplier)
- CPF Top-up (Self/Family): Up to $8,000/yr each

**NOA Import:** Manual overrides from IRAS NOA skip auto-calculation for that relief type.`,
  },
  {
    source: "income",
    target: "take_home",
    calculationName: "Net Pay",
    description:
      "Gross salary minus CPF employee contribution and estimated tax gives take-home pay.",
    filePath: "lib/calculations/take-home.ts",
    calculationLogic: `**Monthly Formula:**
monthlyGross = annualSalary / 12
monthlyEmployeeCpf = calculateCpfContribution(monthlyGross, age).employee
monthlyTakeHome = monthlyGross - monthlyEmployeeCpf

**Annual Formula:**
annualGross = annualSalary + bonus
annualEmployeeCpf = calculateAnnualCpf(salary, bonus, age).totalEmployee
annualTakeHome = annualGross - annualEmployeeCpf

Tax is estimated separately and not deducted from monthly take-home.`,
  },
  {
    source: "take_home",
    target: "cashflow_in",
    calculationName: "Monthly Inflow",
    description:
      "Take-home pay plus bank interest and dividends form the total monthly inflow.",
    filePath: "lib/api/effective-inflow.ts",
    calculationLogic: `**Formula:**
total = monthlyIncome + bankInterest + dividends

Where:
monthlyIncome = annualTakeHome / 12 (or manual override from monthly_cashflow.inflow)
bankInterest = sum(balance × interest_rate_pct / 100 / 12) for each bank account
dividends = sum(quantity × price) for dividend transactions in the month

**Breakdown returned:**
{ total, salary?, bonus?, bankInterest?, dividends? }

If manual override exists: { total, income, bankInterest?, dividends? }`,
  },
  {
    source: "cashflow_out",
    target: "ocbc360",
    calculationName: "Spend Condition",
    description:
      "Monthly discretionary outflow tracked against OCBC 360 spend threshold ($500/mth).",
    filePath: "lib/calculations/ocbc360-status.ts",
    calculationLogic: `**Threshold:**
Minimum card spend: $500/month

**Progress Zone:**
Safe: spend ≥ $500 (100% of target)
Cautious: spend ≥ $350 (70% of target)
Danger: spend < $350

**Bonus Rate if Met:**
First $75k: +0.5% p.a.
Next $25k: +0.5% p.a.`,
  },
  {
    source: "cashflow_in",
    target: "ocbc360",
    calculationName: "Salary Condition",
    description:
      "Monthly salary inflow tracked against OCBC 360 salary credit threshold ($1,800/mth).",
    filePath: "lib/calculations/ocbc360-status.ts",
    calculationLogic: `**Threshold:**
Minimum salary credit: $1,800/month

**Progress Zone:**
Safe: credit ≥ $1,800 (100% of target)
Cautious: credit ≥ $1,260 (70% of target)
Danger: credit < $1,260

**Bonus Rate if Met:**
First $75k: +1.6% p.a.
Next $25k: +3.2% p.a.`,
  },
  {
    source: "bank_balance",
    target: "ocbc360",
    calculationName: "Interest Calc",
    description:
      "OCBC 360 tiered interest calculated on balance with stacked category bonus rates.",
    filePath: "lib/calculations/bank-interest.ts",
    calculationLogic: `**Tiered Balance Structure:**
First $75k: higher bonus rates
Next $25k: lower bonus rates
Total bonus cap: $100k

**Bonus Rates (p.a.):**
              First $75k | Next $25k
Base:         0.05%     | 0.05%
Salary:       1.60%     | 3.20%
Save:         0.60%     | 1.20%
Spend:        0.50%     | 0.50%
Insure:       1.20%     | 2.40%
Invest:       1.20%     | 2.40%
Grow (≥$250k): 2.20%   | 2.20%

**Formula:**
annualInterest = sum(first75k × rate + next25k × rate) for each met category
monthlyInterest = annualInterest / 12`,
  },
  {
    source: "ocbc360",
    target: "bank_forecast",
    calculationName: "Balance Projection",
    description:
      "Projected interest from OCBC 360 feeds into 6-month balance forecast.",
    filePath: "lib/calculations/balance-forecast.ts",
    calculationLogic: `**Formula (per month):**
interest = balance × (annualRate / 100 / 12)
netChange = inflow - outflow + interest
newBalance = balance + netChange

The effective annual rate from OCBC 360 (stacked bonus rates) is used as the annualRate input for the forecast projection.`,
  },
  {
    source: "cashflow_in",
    target: "bank_forecast",
    calculationName: "Inflow Projection",
    description:
      "Monthly inflow used in balance forecast to project future balances.",
    filePath: "lib/calculations/balance-forecast.ts",
    calculationLogic: `**Formula (per month):**
netChange = monthlyInflow - monthlyOutflow + interest
newBalance = previousBalance + netChange

Monthly inflow (primarily take-home pay) is assumed constant across the forecast horizon unless overridden.`,
  },
  {
    source: "cashflow_out",
    target: "bank_forecast",
    calculationName: "Outflow Projection",
    description: "Monthly outflow deducted in balance forecast projection.",
    filePath: "lib/calculations/balance-forecast.ts",
    calculationLogic: `**Formula (per month):**
netChange = monthlyInflow - monthlyOutflow + interest
newBalance = previousBalance + netChange

Monthly outflow is the effective total from all recurring obligations (discretionary, insurance, ILP, loans, tax).`,
  },
  {
    source: "loan_principal",
    target: "loan_monthly",
    calculationName: "Amortization",
    description:
      "Standard amortization formula: principal, rate, and tenure determine monthly payment.",
    filePath: "lib/calculations/loans.ts",
    calculationLogic: `**Amortization Formula:**
M = P × [r(1+r)^n] / [(1+r)^n - 1]

Where:
M = monthly payment
P = loan principal
r = annualRate / 100 / 12 (monthly rate)
n = tenure in months

**Edge Cases:**
If rate = 0%: M = P / n (simple division)
If principal ≤ 0 or tenure ≤ 0: M = 0`,
  },
  {
    source: "loan_principal",
    target: "loan_outstanding",
    calculationName: "Balance Tracking",
    description:
      "Outstanding balance computed by replaying all repayment events against original principal.",
    filePath: "lib/calculations/loans.ts",
    calculationLogic: `**Algorithm:**
Sort all repayment events (scheduled + early) by date.

For each event:
  If early repayment:
    balance -= amount (full principal reduction)
  If scheduled payment:
    interestPortion = balance × (annualRate / 100 / 12)
    principalPortion = min(payment - interestPortion, balance)
    balance -= principalPortion

Returns remaining balance rounded to 2 decimal places.`,
  },
  {
    source: "early_repayment",
    target: "loan_outstanding",
    calculationName: "Principal Reduction",
    description:
      "Early repayments reduce principal directly, saving interest over remaining tenure.",
    filePath: "lib/calculations/loans.ts",
    calculationLogic: `**Logic:**
balance = max(0, balance - earlyRepaymentAmount)

Early repayments reduce the outstanding principal in full (no interest portion). This saves interest over the remaining loan tenure.

**Savings Estimate:**
interestSaved = earlyAmount × (annualRate/100/12) × remainingMonths (approximate)`,
  },
  {
    source: "loan_monthly",
    target: "cashflow_out",
    calculationName: "Loan Deduction",
    description:
      "Monthly loan repayment is a recurring outflow in cashflow tracking.",
    filePath: "lib/api/effective-outflow.ts",
    calculationLogic: `**Effective Outflow Formula (10 categories):**
total = discretionary + insurance + ilp + ilpOneTime + loans + earlyRepayments + tax + taxReliefCash + savingsGoals + investments

Where:
discretionary = userReportedOutflow + giroOutflow
insurance = sum(monthlyEquivalent) for active non-ILP policies
ilp = sum(monthlyPremium) for recurring ILP products + ILP-type insurance policies
ilpOneTime = sum(lumpSum) for one-time ILP products created this month
loans = sum(amortizedPayment) for non-CPF-OA loans
earlyRepayments = sum(amount + penalty) for early repayments this month
tax = actual_amount/12 if recorded, else calculated estimate / 12
taxReliefCash = sum(annualAmount/12) for SRS + CPF top-up reliefs
savingsGoals = sum(monthly_auto_amount) + manual contributions this month
investments = max(0, buys - sells) for investment transactions this month`,
  },
  {
    source: "ilp_premium",
    target: "cashflow_out",
    calculationName: "Premium Outflow",
    description: "ILP monthly premiums contribute to total monthly outflow.",
    filePath: "lib/investments/ilp-premium-derive.ts",
    calculationLogic: `**Formula:**
Each ILP group has a total monthly premium split across products:
productPremium = groupTotal × (allocationPct / 100)
Last product absorbs rounding remainder.

**Outflow:**
totalIlpOutflow = sum(all group monthly premiums)
This is added to effective monthly outflow.`,
  },
  {
    source: "ilp_premium",
    target: "ilp_value",
    calculationName: "Fund Accumulation",
    description:
      "Premiums allocated by % to individual ILP funds accumulate into fund values.",
    filePath: "lib/investments/ilp-group-summary.ts",
    calculationLogic: `**Premium Split:**
For each product in group:
  monthlyAllocation = groupTotal × (allocationPct / 100)
  totalInvested = monthlyPremium × monthsElapsed

**Return Calculation:**
returnPct = ((fundValue - premiumsPaid) / premiumsPaid) × 100

**Monthly Variance:**
delta = currentMonth.fundValue - previousMonth.fundValue`,
  },
  {
    source: "insurance_premium",
    target: "cashflow_out",
    calculationName: "Premium Outflow",
    description: "Insurance premiums contribute to monthly outflow.",
    filePath: "lib/calculations/insurance-premium.ts",
    calculationLogic: `**Frequency Conversion:**
If monthly: monthlyEquivalent = premium
If yearly: monthlyEquivalent = premium / 12

**Actual Monthly Amount:**
If yearly and currentMonth = dueMonth: actualAmount = fullPremium
If yearly and currentMonth ≠ dueMonth: actualAmount = 0
If monthly: actualAmount = premium

Both monthlyEquivalent (for budgeting) and actualAmount (for cashflow) are tracked.`,
  },
  {
    source: "income",
    target: "insurance_coverage",
    calculationName: "Needs Analysis",
    description:
      "Income determines required coverage levels for life, CI, and disability insurance.",
    filePath: "lib/calculations/insurance.ts",
    calculationLogic: `**Coverage Multipliers by Life Stage:**
Pre-retirement (55+): Death 3×, CI 4×
Single, no dependents: Death 3×, CI 4×
Married, no dependents: Death 6×, CI 4×
With dependents: Death 9×, CI 5×

**Coverage Benchmarks:**
Death: annualSalary × deathMultiplier
CI: annualSalary × ciMultiplier
Early CI: ciNeeded × 0.25
Disability: monthlySalary × 0.75 × 60 months
TPD: annualSalary × 9

**Coverage Gap:**
gap = needed - held
score = weighted average of (held/needed) across all types`,
  },
  {
    source: "bank_balance",
    target: "savings_goals",
    calculationName: "Goal Progress",
    description: "Bank balances contribute to savings goal progress tracking.",
    filePath: "lib/calculations/savings-goals.ts",
    calculationLogic: `**Monthly Auto-Contribution:**
monthlyAmount = (target - current) / monthsRemaining

Where:
monthsRemaining = months between now and deadline
Returns null if goal already met or no deadline set.

**Progress:**
progressPct = (current / target) × 100`,
  },
  {
    source: "investments",
    target: "savings_goals",
    calculationName: "Investment Value",
    description:
      "Investment portfolio value contributes to net worth and savings goals.",
    filePath: "lib/calculations/savings-goals.ts",
    calculationLogic: `**Portfolio Value:**
marketValue = units × currentPrice
unrealisedPnL = marketValue - (units × costBasis)
unrealisedPnLPct = (unrealisedPnL / totalCost) × 100

**Weighted Average Cost:**
WAC = (existingUnits × costBasis + newUnits × price) / totalUnits

Investment market value contributes to overall net worth and savings goal tracking.`,
  },
  {
    source: "ilp_one_time",
    target: "cashflow_out",
    calculationName: "One-Time ILP Outflow",
    description:
      "One-time ILP premium payments are real cash outflows from the bank, recorded in the month they were paid.",
    filePath: "lib/api/effective-outflow.ts",
    calculationLogic: `**Logic:**
For each ILP product with premium_payment_mode = 'one_time':
  If created_at falls within the target month:
    outflow += monthly_premium (which is the lump sum amount)

One-time ILPs are excluded from recurring monthly outflow but counted as a one-off cash outflow in the month of purchase.`,
  },
  {
    source: "tax_relief_cash",
    target: "cashflow_out",
    calculationName: "Relief Cash Outflow",
    description:
      "SRS contributions and CPF voluntary top-ups are real cash leaving the bank, not just tax deductions.",
    filePath: "lib/api/effective-outflow.ts",
    calculationLogic: `**Formula:**
monthlyOutflow = sum(annualAmount / 12) for each relief_type in ('srs', 'cpf_topup_self', 'cpf_topup_family')

These are actual bank outflows that also provide tax relief.
SRS cap: $15,300/yr. CPF top-up cap: $8,000/yr per type.`,
  },
  {
    source: "tax_relief_cash",
    target: "tax_reliefs",
    calculationName: "Tax Relief Benefit",
    description:
      "SRS and CPF voluntary top-ups provide tax deductions in addition to being cash outflows.",
    filePath: "lib/calculations/tax.ts",
    calculationLogic: `**SRS Relief:** Up to $15,300/yr deductible
**CPF Top-up (Self):** Up to $8,000/yr deductible
**CPF Top-up (Family):** Up to $8,000/yr deductible

These amounts reduce chargeable income, lowering tax payable.`,
  },
  {
    source: "dividends",
    target: "cashflow_in",
    calculationName: "Dividend Income",
    description:
      "Dividends received from investments credit the investment cash balance and count as inflow.",
    filePath: "lib/api/effective-inflow.ts",
    calculationLogic: `**Formula:**
dividendIncome = sum(quantity × price) for all dividend transactions in the month

Dividends credit investment_accounts.cash_balance and appear as inflow in the cashflow breakdown.`,
  },
  {
    source: "investment_purchases",
    target: "cashflow_out",
    calculationName: "Net Investment Outflow",
    description:
      "Net stock/ETF purchases (buys minus sells) for the month, representing cash deployed into investments.",
    filePath: "lib/api/effective-outflow.ts",
    calculationLogic: `**Formula:**
netPurchases = sum(buy transactions) - sum(sell transactions)
outflow = max(0, netPurchases)

Only positive net purchases count as outflow. If sells exceed buys, the net is $0 outflow (the proceeds stay in investment cash balance).`,
  },
  {
    source: "early_repayment",
    target: "cashflow_out",
    calculationName: "Early Repayment Outflow",
    description:
      "Early loan repayments are one-time cash outflows from the bank in the month they occur.",
    filePath: "lib/api/effective-outflow.ts",
    calculationLogic: `**Formula:**
earlyRepaymentOutflow = sum(amount + penalty_amount) for repayments in the target month

Includes any prepayment penalties. CPF-funded early repayments are excluded from cash outflow.`,
  },
  {
    source: "bank_interest",
    target: "cashflow_in",
    calculationName: "Interest Income",
    description:
      "Estimated monthly bank interest earned from all bank accounts.",
    filePath: "lib/api/effective-inflow.ts",
    calculationLogic: `**Formula:**
monthlyInterest = sum(balance × interest_rate_pct / 100 / 12) for each bank account

Uses the opening_balance and interest_rate_pct from bank_accounts table as a rough monthly estimate.`,
  },
  {
    source: "savings_goals",
    target: "cashflow_out",
    calculationName: "Goal Contributions",
    description:
      "Both automatic monthly contributions and manual one-off contributions to savings goals.",
    filePath: "lib/api/effective-outflow.ts",
    calculationLogic: `**Formula:**
totalGoalOutflow = sum(monthly_auto_amount) + sum(manual contributions this month)

Auto-contributions are recurring. Manual contributions from goal_contributions table are added for the specific month.`,
  },
  {
    source: "giro_transfers",
    target: "cashflow_out",
    calculationName: "GIRO Auto-Debit",
    description:
      "GIRO standing instructions auto-debit from bank accounts into outflow categories (spending, investments, SRS, CPF investments).",
    filePath: "lib/api/giro-amounts.ts",
    calculationLogic: `**Formula:**
giroOutflow = sum(amount) for active giro_rules where destination_type in ('outflow', 'investments', 'cpf_investments', 'srs')

Rules are attributed to a profile via source_bank_account.profile_id.

**In effective outflow:**
discretionary = userReportedOutflow + giroOutflow

GIRO transfers are also shown as a separate line item in the waterfall and Sankey charts.`,
  },
  {
    source: "bank_interest",
    target: "bank_balance",
    calculationName: "Interest Accumulation",
    description:
      "Bank interest earned each month accumulates into the bank account balance.",
    filePath: "lib/calculations/bank-interest.ts",
    calculationLogic: `**Formula:**
newBalance = previousBalance + monthlyInterest

Where:
monthlyInterest = balance × (interest_rate_pct / 100 / 12)

Interest is credited to the account balance monthly, increasing the base for the next month's interest calculation.`,
  },
  {
    source: "investments",
    target: "dividends",
    calculationName: "Dividend Distribution",
    description:
      "Holdings in the investment portfolio generate dividend income, recorded as dividend transactions.",
    filePath: "lib/api/effective-inflow.ts",
    calculationLogic: `**Formula:**
dividendIncome = sum(quantity × price) for investment_transactions where type = 'dividend'

Dividends are generated by held positions (stocks, ETFs, REITs) and recorded as transactions.
They flow into monthly inflow as a separate line item alongside take-home pay and bank interest.`,
  },
  {
    source: "cpf_healthcare",
    target: "cpf_balance",
    calculationName: "MA Healthcare Deduction",
    description:
      "Healthcare premiums (MSL, CareShield Life, ISP) are deducted monthly from MediSave Account.",
    filePath: "lib/calculations/cpf-healthcare.ts",
    calculationLogic: `**Formula:**
monthlyMaDeduction = (msl + csl + sup + pmi) / 12
ma = max(0, ma - monthlyMaDeduction)

**Schemes:**
MSL (MediShield Life): Mandatory, age-banded ($200–$2,826/yr, 15 bands)
CSL (CareShield Life): Mandatory from 1980 cohort, user-configured
SUP (CareShield Life Supplement): Optional, user-configured
PMI (Integrated Shield Plan): Optional, user-configured

MSL uses age-next-birthday for band lookup. Override available via cpf_healthcare_config.msl_annual_override.`,
  },
  {
    source: "cpf_healthcare",
    target: "cpf_retirement",
    calculationName: "Projection MA Deduction",
    description:
      "Healthcare MA deductions are applied month-by-month in CPF retirement projections, reducing projected MA balance.",
    filePath: "lib/calculations/cpf-retirement.ts",
    calculationLogic: `**Integration:**
projectCpfGrowth() accepts getMonthlyMaDeduction(age, calendarYear) callback.

Each projection month:
  monthlyHealthcare = getMonthlyMaDeduction(age, year)
  ma = max(0, ma - monthlyHealthcare)

Applied to all 3 projections: to-age-55, extended-to-70, and without-housing comparison.`,
  },
  {
    source: "tax_payable",
    target: "tax_giro",
    calculationName: "GIRO Instalment",
    description:
      "Tax payable is split into 12 monthly GIRO instalments from April to March of the following year.",
    filePath: "lib/calculations/tax-giro.ts",
    calculationLogic: `**Formula:**
monthlyBase = floor(taxPayable / 12 × 100) / 100
schedule = 12 payments: Apr [YA] → Mar [YA+1]
lastPayment = total - (monthlyBase × 11)

**Outstanding Balance:**
If outstanding balance exists, it is added to the first payment.
Tax portion is re-split evenly; outstanding added on top of first instalment.

**Next Payment:**
Determined by comparing current month against schedule months.`,
  },
  {
    source: "dependents",
    target: "tax_reliefs",
    calculationName: "Dependent Reliefs",
    description:
      "Family dependents (children, parents) auto-derive QCR, WMCR, and parent reliefs.",
    filePath: "lib/calculations/tax-reliefs.ts",
    calculationLogic: `**Qualifying Child Relief (QCR):**
Born 2024+: $8,000 (1st), $10,000 (2nd), $12,000 (3rd+)
Born before 2024: $4,000 per child
Handicapped child: $7,500 (replaces standard QCR)

**Working Mother's Child Relief (WMCR):**
Born 2024+: Fixed $8,000/$10,000/$12,000 by birth order
Born before 2024: 15%/20%/25% of mother's earned income by birth order
Per-child cap: QCR + WMCR ≤ $50,000

**Parent Relief:**
Living with claimant: $9,000 (normal), $14,000 (handicapped)
Not living with: $5,500 (normal), $10,000 (handicapped)
Max 2 parents claimed. Income must be < $8,000.`,
  },
  {
    source: "income",
    target: "tax_reliefs",
    calculationName: "Spouse Relief",
    description:
      "Spouse relief ($2,000) auto-derived when married and spouse's annual income is below $8,000.",
    filePath: "lib/calculations/tax.ts",
    calculationLogic: `**Formula:**
if marital_status === 'married' AND spouse.annual_income < $8,000:
  spouseRelief = $2,000
else:
  spouseRelief = $0

Auto-derived from linked spouse profile's income_config. Skipped if manual 'spouse' relief override exists.`,
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
