import type {
  BankStatementExtractionResult,
  BankTransaction,
  CcStatementExtractionResult,
  CpfExtractionResult,
  ExtractionResult,
  IlpExtractionResult,
  InsuranceExtractionResult,
  InvestmentExtractionResult,
  LoanExtractionResult,
  TaxExtractionResult,
} from "@/lib/pdf-import/types"
import { DOCUMENT_TYPE_LABELS } from "@/lib/pdf-import/types"

type Field = { label: string; value: string }

function buildCategoryBreakdown(
  transactions: BankTransaction[],
): Array<{ name: string; count: number; total: number }> {
  const map = new Map<string, { count: number; total: number }>()
  for (const txn of transactions) {
    if (txn.excludeFromSpending) continue
    const name = txn.categoryName || "Others"
    const existing = map.get(name) ?? { count: 0, total: 0 }
    existing.count++
    existing.total += Math.abs(txn.amount)
    map.set(name, existing)
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.total - a.total)
}

function fmtAmt(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function pushIfTruthy(fields: Field[], label: string, value: string | null | undefined) {
  if (value) fields.push({ label, value })
}

function pushIfPresent(fields: Field[], label: string, value: number | null | undefined, format: (n: number) => string = fmtAmt) {
  if (value !== null && value !== undefined) fields.push({ label, value: format(value) })
}

function cpfFields(r: CpfExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfTruthy(fields, "Month", r.month)
  pushIfPresent(fields, "OA", r.oa)
  pushIfPresent(fields, "SA", r.sa)
  pushIfPresent(fields, "MA", r.ma)
  return fields
}

function insuranceFields(r: InsuranceExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfTruthy(fields, "Insurer", r.insurer)
  pushIfTruthy(fields, "Policy Name", r.name)
  pushIfTruthy(fields, "Policy No.", r.policyNumber)
  if (r.type) fields.push({ label: "Policy Type", value: r.type.replaceAll("_", " ") })
  pushIfPresent(fields, "Premium", r.premiumAmount)
  pushIfTruthy(fields, "Frequency", r.frequency)
  pushIfPresent(fields, "CPF Premium", r.cpfPremium)
  pushIfPresent(fields, "Coverage", r.coverageAmount)
  pushIfPresent(fields, "Coverage Till Age", r.coverageTillAge, String)
  pushIfTruthy(fields, "Inception", r.inceptionDate)
  pushIfTruthy(fields, "End Date", r.endDate)
  if (r.premiumWaiver) fields.push({ label: "Premium Waiver", value: "Yes" })
  pushIfPresent(fields, "Cash Value", r.cashValue)
  pushIfPresent(fields, "Maturity Value", r.maturityValue)
  if (r.benefits.length === 0) return fields

  fields.push({ label: "Benefits", value: `${r.benefits.length} extracted` })
  for (const b of r.benefits.slice(0, 5)) {
    fields.push({ label: `  ${b.benefitName}`, value: fmtAmt(b.coverageAmount) })
  }
  if (r.benefits.length > 5) {
    fields.push({ label: "", value: `... +${r.benefits.length - 5} more` })
  }
  return fields
}

function pushTransactionStats(
  fields: Field[],
  transactions: BankTransaction[],
  totalDebit: number | null,
  totalCredit: number | null,
  debitLabel: string,
  creditLabel: string,
) {
  if (transactions.length === 0) return
  fields.push({ label: "Transactions", value: `${transactions.length} found` })
  if (totalDebit !== null) fields.push({ label: debitLabel, value: fmtAmt(Math.abs(totalDebit)) })
  if (totalCredit !== null) fields.push({ label: creditLabel, value: fmtAmt(totalCredit) })
  for (const entry of buildCategoryBreakdown(transactions).slice(0, 6)) {
    fields.push({ label: `  ${entry.name}`, value: `${entry.count} txns (${fmtAmt(entry.total)})` })
  }
}

function bankFields(r: BankStatementExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfTruthy(fields, "Bank", r.bankName)
  pushIfTruthy(fields, "Month", r.month)
  if (r.accountNumber) fields.push({ label: "Account", value: `...${r.accountNumber.slice(-4)}` })
  pushIfPresent(fields, "Opening Bal.", r.openingBalance)
  pushIfPresent(fields, "Closing Bal.", r.closingBalance)
  pushTransactionStats(fields, r.transactions, r.totalDebit, r.totalCredit, "Total Withdrawals", "Total Deposits")
  return fields
}

function ccFields(r: CcStatementExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfTruthy(fields, "Bank", r.bankName)
  pushIfTruthy(fields, "Month", r.month)
  if (r.cardNumber) fields.push({ label: "Card", value: `...${r.cardNumber.slice(-4)}` })
  pushIfPresent(fields, "Amount Due", r.totalAmountDue)
  pushIfPresent(fields, "Min. Payment", r.minimumPayment)
  pushTransactionStats(fields, r.transactions, r.totalDebit, r.totalCredit, "Total Charges", "Total Credits")
  return fields
}

function taxFields(r: TaxExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfPresent(fields, "Year of Assessment", r.year, String)
  pushIfPresent(fields, "Tax Payable", r.taxPayable)
  return fields
}

function loanFields(r: LoanExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfTruthy(fields, "Lender", r.lender)
  pushIfTruthy(fields, "Loan Name", r.name)
  pushIfTruthy(fields, "Loan Type", r.type)
  pushIfPresent(fields, "Principal", r.principal)
  if (r.ratePct !== null) fields.push({ label: "Rate", value: `${r.ratePct}% p.a.` })
  if (r.tenureMonths !== null) fields.push({ label: "Tenure", value: `${r.tenureMonths} months` })
  pushIfTruthy(fields, "Start Date", r.startDate)
  return fields
}

function ilpFields(r: IlpExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfTruthy(fields, "Product", r.productName)
  pushIfTruthy(fields, "Month", r.month)
  pushIfPresent(fields, "Fund Value", r.fundValue)
  pushIfPresent(fields, "Premiums Paid", r.premiumsPaid)
  return fields
}

function investmentFields(r: InvestmentExtractionResult): Field[] {
  const fields: Field[] = []
  pushIfTruthy(fields, "Month", r.month)
  pushIfPresent(fields, "Total Value", r.totalValue)
  if (r.holdings.length > 0) {
    fields.push({
      label: "Holdings",
      value: r.holdings.map((h) => `${h.symbol} × ${h.units}`).join(", "),
    })
  }
  return fields
}

function fieldsForDocType(result: ExtractionResult): Field[] {
  switch (result.docType) {
    case "cpf_statement":
      return cpfFields(result)
    case "insurance_policy":
      return insuranceFields(result)
    case "bank_statement":
      return bankFields(result)
    case "cc_statement":
      return ccFields(result)
    case "tax_noa":
      return taxFields(result)
    case "loan_letter":
      return loanFields(result)
    case "ilp_statement":
      return ilpFields(result)
    case "investment_statement":
      return investmentFields(result)
  }
}

/**
 * Format extracted data as a human-readable summary for Telegram.
 * Returns an array of { label, value } fields for buildConfirmationMessage.
 */
export function formatExtractionSummary(result: ExtractionResult): Field[] {
  const fields: Field[] = [{ label: "Type", value: DOCUMENT_TYPE_LABELS[result.docType] }]
  fields.push(...fieldsForDocType(result))
  if (result.warnings.length > 0) {
    fields.push({
      label: "⚠️ Warnings",
      value: result.warnings.map((w) => w.message).join("; "),
    })
  }
  return fields
}
