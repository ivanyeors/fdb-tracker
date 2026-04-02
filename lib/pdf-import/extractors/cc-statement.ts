import type {
  CcStatementExtractionResult,
  BankTransaction,
  ExtractionWarning,
} from "@/lib/pdf-import/types"
import { detectBank, extractMonth } from "@/lib/pdf-import/parsers/common"
import {
  parseOcbcCcStatement,
  categorizeTransaction,
  type CategoryRule,
} from "@/lib/pdf-import/parsers/ocbc-transaction-parser"
import { parseCitibankCcStatement } from "@/lib/pdf-import/parsers/citibank-transaction-parser"

export function extractCcStatement(
  text: string,
  pages?: string[],
): CcStatementExtractionResult {
  const warnings: ExtractionWarning[] = []

  const bankName = detectBank(text)
  if (!bankName)
    warnings.push({ field: "bankName", message: "Could not detect bank name" })

  const month = extractMonth(text)
  if (!month)
    warnings.push({ field: "month", message: "Could not determine statement month" })

  // Route to bank-specific parser
  let transactions: BankTransaction[] = []
  let cardNumber: string | null = null
  let statementDate: string | null = null
  let paymentDueDate: string | null = null
  let totalAmountDue: number | null = null
  let minimumPayment: number | null = null

  if (pages && pages.length > 0) {
    if (bankName === "Citibank") {
      const result = parseCitibankCcStatement(pages)
      cardNumber = result.cardNumber
      statementDate = result.statementDate
      paymentDueDate = result.paymentDueDate
      totalAmountDue = result.totalAmountDue
      minimumPayment = result.minimumPayment
      transactions = result.transactions.map((t) => ({
        date: t.date,
        valueDate: t.valueDate,
        description: t.description,
        amount: t.amount,
        balance: t.balance,
        txnType: t.txnType,
        categoryName: t.categoryName,
        foreignCurrency: t.foreignCurrency,
        excludeFromSpending: t.excludeFromSpending,
        rawText: t.rawText,
      }))
    } else {
      // Default to OCBC CC parser
      const result = parseOcbcCcStatement(pages)
      cardNumber = result.cardNumber
      statementDate = result.statementDate
      paymentDueDate = result.paymentDueDate
      totalAmountDue = result.totalAmountDue
      minimumPayment = result.minimumPayment
      transactions = result.transactions.map((t) => ({
        date: t.date,
        valueDate: t.valueDate,
        description: t.description,
        amount: t.amount,
        balance: t.balance,
        txnType: t.txnType,
        categoryName: t.categoryName,
        foreignCurrency: t.foreignCurrency,
        excludeFromSpending: t.excludeFromSpending,
        rawText: t.rawText,
      }))
    }
  } else {
    warnings.push({
      field: "transactions",
      message: "Per-page text not available — transaction parsing requires page-level text",
    })
  }

  // Auto-categorize transactions (using empty rules — real rules loaded at save time)
  const defaultRules: CategoryRule[] = []
  for (const txn of transactions) {
    if (!txn.categoryName) {
      txn.categoryName = categorizeTransaction(txn.description, defaultRules)
    }
  }

  const totalDebit = transactions
    .filter((t) => t.txnType === "debit")
    .reduce((sum, t) => sum + t.amount, 0)
  const totalCredit = transactions
    .filter((t) => t.txnType === "credit")
    .reduce((sum, t) => sum + t.amount, 0)

  if (transactions.length === 0) {
    warnings.push({
      field: "transactions",
      message: "No transactions found in statement",
    })
  }

  return {
    docType: "cc_statement",
    bankName,
    month: month ?? (statementDate ? statementDate.slice(0, 7) + "-01" : null),
    cardNumber,
    statementDate,
    paymentDueDate,
    totalAmountDue,
    minimumPayment,
    transactions,
    totalDebit: totalDebit || null,
    totalCredit: totalCredit || null,
    warnings,
  }
}
