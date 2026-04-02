import type {
  BankStatementExtractionResult,
  BankTransaction,
  ExtractionWarning,
} from "@/lib/pdf-import/types"
import {
  parseAmount,
  detectBank,
  extractMonth,
} from "@/lib/pdf-import/parsers/common"
import {
  parseOcbcBankStatement,
  categorizeTransaction,
  type CategoryRule,
} from "@/lib/pdf-import/parsers/ocbc-transaction-parser"

function extractBalance(text: string, patterns: RegExp[]): number | null {
  for (const pat of patterns) {
    const match = text.match(pat)
    if (match) {
      // Look for dollar amount near the match
      const afterMatch = text.slice(
        (match.index ?? 0),
        (match.index ?? 0) + match[0].length + 150
      )
      const amountMatch = afterMatch.match(/(?:S?\$)?\s*([\d,]+\.\d{2})/)
      if (amountMatch) {
        const val = parseAmount(amountMatch[1])
        if (val !== null) return val
      }
    }
  }
  return null
}

export function extractBankStatement(
  text: string,
  pages?: string[],
): BankStatementExtractionResult {
  const warnings: ExtractionWarning[] = []

  const bankName = detectBank(text)
  if (!bankName) warnings.push({ field: "bankName", message: "Could not detect bank name" })

  const month = extractMonth(text)
  if (!month) warnings.push({ field: "month", message: "Could not determine statement month" })

  // Existing balance extraction (works on merged text)
  let openingBalance = extractBalance(text, [
    /opening\s+balance/i,
    /beginning\s+balance/i,
    /balance\s+brought?\s+forward/i,
  ])
  let closingBalance = extractBalance(text, [
    /closing\s+balance/i,
    /ending\s+balance/i,
    /balance\s+carried?\s+forward/i,
  ])

  // Transaction parsing (requires per-page text)
  let transactions: BankTransaction[] = []
  let accountNumber: string | null = null
  let totalDebit: number | null = null
  let totalCredit: number | null = null

  if (pages && pages.length > 0 && bankName === "OCBC") {
    const result = parseOcbcBankStatement(pages)
    accountNumber = result.accountNumber
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

    // Use parser's balances if our regex extraction missed them
    if (openingBalance === null && result.openingBalance !== null) {
      openingBalance = result.openingBalance
    }
    if (closingBalance === null && result.closingBalance !== null) {
      closingBalance = result.closingBalance
    }

    // Auto-categorize (empty rules — real rules loaded at save time)
    const defaultRules: CategoryRule[] = []
    for (const txn of transactions) {
      if (!txn.categoryName) {
        txn.categoryName = categorizeTransaction(txn.description, defaultRules)
      }
    }

    totalDebit = transactions
      .filter((t) => t.txnType === "debit")
      .reduce((sum, t) => sum + t.amount, 0) || null
    totalCredit = transactions
      .filter((t) => t.txnType === "credit")
      .reduce((sum, t) => sum + t.amount, 0) || null
  }

  if (openingBalance === null) {
    warnings.push({ field: "openingBalance", message: "Could not extract opening balance" })
  }
  if (closingBalance === null) {
    warnings.push({ field: "closingBalance", message: "Could not extract closing balance" })
  }

  return {
    docType: "bank_statement",
    bankName,
    month,
    openingBalance,
    closingBalance,
    accountNumber,
    transactions,
    totalDebit,
    totalCredit,
    warnings,
  }
}
