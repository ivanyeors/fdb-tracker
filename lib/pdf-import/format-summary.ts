import type { ExtractionResult } from "@/lib/pdf-import/types"
import { DOCUMENT_TYPE_LABELS } from "@/lib/pdf-import/types"

function fmtAmt(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

/**
 * Format extracted data as a human-readable summary for Telegram.
 * Returns an array of { label, value } fields for buildConfirmationMessage.
 */
export function formatExtractionSummary(
  result: ExtractionResult,
): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = []

  fields.push({ label: "Type", value: DOCUMENT_TYPE_LABELS[result.docType] })

  switch (result.docType) {
    case "cpf_statement":
      if (result.month) fields.push({ label: "Month", value: result.month })
      if (result.oa !== null) fields.push({ label: "OA", value: fmtAmt(result.oa) })
      if (result.sa !== null) fields.push({ label: "SA", value: fmtAmt(result.sa) })
      if (result.ma !== null) fields.push({ label: "MA", value: fmtAmt(result.ma) })
      break

    case "insurance_policy":
      if (result.insurer) fields.push({ label: "Insurer", value: result.insurer })
      if (result.name) fields.push({ label: "Policy Name", value: result.name })
      if (result.policyNumber) fields.push({ label: "Policy No.", value: result.policyNumber })
      if (result.type) fields.push({ label: "Policy Type", value: result.type.replace(/_/g, " ") })
      if (result.premiumAmount !== null) fields.push({ label: "Premium", value: fmtAmt(result.premiumAmount) })
      if (result.frequency) fields.push({ label: "Frequency", value: result.frequency })
      if (result.coverageAmount !== null) fields.push({ label: "Coverage", value: fmtAmt(result.coverageAmount) })
      if (result.inceptionDate) fields.push({ label: "Inception", value: result.inceptionDate })
      if (result.endDate) fields.push({ label: "End Date", value: result.endDate })
      break

    case "bank_statement":
      if (result.bankName) fields.push({ label: "Bank", value: result.bankName })
      if (result.month) fields.push({ label: "Month", value: result.month })
      if (result.openingBalance !== null) fields.push({ label: "Opening Bal.", value: fmtAmt(result.openingBalance) })
      if (result.closingBalance !== null) fields.push({ label: "Closing Bal.", value: fmtAmt(result.closingBalance) })
      break

    case "tax_noa":
      if (result.year !== null) fields.push({ label: "Year of Assessment", value: String(result.year) })
      if (result.taxPayable !== null) fields.push({ label: "Tax Payable", value: fmtAmt(result.taxPayable) })
      break

    case "loan_letter":
      if (result.lender) fields.push({ label: "Lender", value: result.lender })
      if (result.name) fields.push({ label: "Loan Name", value: result.name })
      if (result.type) fields.push({ label: "Loan Type", value: result.type })
      if (result.principal !== null) fields.push({ label: "Principal", value: fmtAmt(result.principal) })
      if (result.ratePct !== null) fields.push({ label: "Rate", value: `${result.ratePct}% p.a.` })
      if (result.tenureMonths !== null) fields.push({ label: "Tenure", value: `${result.tenureMonths} months` })
      if (result.startDate) fields.push({ label: "Start Date", value: result.startDate })
      break

    case "ilp_statement":
      if (result.productName) fields.push({ label: "Product", value: result.productName })
      if (result.month) fields.push({ label: "Month", value: result.month })
      if (result.fundValue !== null) fields.push({ label: "Fund Value", value: fmtAmt(result.fundValue) })
      if (result.premiumsPaid !== null) fields.push({ label: "Premiums Paid", value: fmtAmt(result.premiumsPaid) })
      break

    case "investment_statement":
      if (result.month) fields.push({ label: "Month", value: result.month })
      if (result.totalValue !== null) fields.push({ label: "Total Value", value: fmtAmt(result.totalValue) })
      if (result.holdings.length > 0) {
        fields.push({
          label: "Holdings",
          value: result.holdings
            .map((h) => `${h.symbol} × ${h.units}`)
            .join(", "),
        })
      }
      break
  }

  if (result.warnings.length > 0) {
    fields.push({
      label: "⚠️ Warnings",
      value: result.warnings.map((w) => w.message).join("; "),
    })
  }

  return fields
}
