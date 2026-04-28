/**
 * Citibank Credit Card Statement transaction parser.
 *
 * Parses individual transactions from text extracted by unpdf (per-page, with line breaks).
 *
 * Transaction lines from unpdf look like:
 *   "07 DEC TAOBAO 125 LONDON WAGB 9.14"
 *   "XXXX-XXXX-XXXX-3818"  (card suffix on next line)
 *   "08 DEC FAST INCOMING PAYMENT (4,292.44)"  (parenthesized = credit)
 *   "09 DEC CCY CONVERSION FEE SGD 9.14 0.09"  (fee txn)
 */

import {
  MONTH_MAP,
  resolveDateDDMMM,
  parseAmount,
} from "@/lib/pdf-import/parsers/common"
import type { ParsedTransaction } from "@/lib/pdf-import/parsers/ocbc-transaction-parser"

export interface CitibankCcParseResult {
  layout: "cc"
  transactions: ParsedTransaction[]
  cardNumber: string | null
  cardName: string | null
  statementMonth: string | null
  statementDate: string | null
  paymentDueDate: string | null
  totalAmountDue: number | null
  minimumPayment: number | null
  previousBalance: number | null
  paymentsCredits: number | null
  purchasesAdvances: number | null
  interestCharges: number | null
  feesCharges: number | null
}

/** Matches "DD MMM" at line start — transaction start */
const TXN_START = /^(\d{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+/i

/** Card suffix line: XXXX-XXXX-XXXX-NNNN */
const CARD_SUFFIX = /^XXXX-XXXX-XXXX-\d{4}$/

const STOP_MARKERS = [
  "SUB-TOTAL:",
  "GRAND TOTAL",
  "YOUR CITI MILES",
  "Important Announcements",
  "MOVING? CHANGING",
  "Citibank Visa and Mastercard",
  "THIS PAGE IS INTENTIONALLY",
]

const SKIP_LINES = [
  "TRANSACTIONS FOR CITI",
  "ALL TRANSACTIONS BILLED",
  "BALANCE PREVIOUS STATEMENT",
  "DATE DESCRIPTION AMOUNT",
  "CITI PREMIERMILES",
  "CITI REWARDS",
  "Co Reg No:",
  "EPSTCSX",
  "Citibank Singapore",
  "Robinson Road",
  "Page ",
  "KINDLY ENSURE",
  "KINDLY CALL",
  "Payment Due Date:",
]

export function parseCitibankCcStatement(
  pages: string[]
): CitibankCcParseResult {
  const transactions: ParsedTransaction[] = []
  let cardNumber: string | null = null
  let cardName: string | null = null
  let statementMonth: string | null = null
  let statementDate: string | null = null
  let paymentDueDate: string | null = null
  let totalAmountDue: number | null = null
  let minimumPayment: number | null = null
  let previousBalance: number | null = null
  let paymentsCredits: number | null = null
  let purchasesAdvances: number | null = null
  let interestCharges: number | null = null
  let feesCharges: number | null = null

  const allText = pages.join("\n")

  // Extract metadata
  const cardNumMatch = /(\d{4}\s+\d{4}\s+\d{4}\s+\d{4})/.exec(allText)
  if (cardNumMatch) cardNumber = cardNumMatch[1].replaceAll(/\s+/g, "-")

  if (allText.includes("CITI PREMIERMILES")) cardName = "Citi PremierMiles"
  else if (allText.includes("CITI REWARDS")) cardName = "Citi Rewards"

  // Statement Date: "Statement Date January 05, 2026" or "Statement Date: January 05, 2026"
  const stmtDateMatch =
    /Statement\s+Date:?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i.exec(
      allText
    )
  if (stmtDateMatch) {
    const mm = MONTH_MAP[stmtDateMatch[1].toLowerCase()]
    if (mm) {
      const dd = stmtDateMatch[2].padStart(2, "0")
      statementDate = `${stmtDateMatch[3]}-${mm}-${dd}`
      statementMonth = `${stmtDateMatch[3]}-${mm}-01`
    }
  }

  // Payment Due Date
  const dueDateMatch =
    /Payment\s+Due\s+Date:?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i.exec(
      allText
    )
  if (dueDateMatch) {
    const mm = MONTH_MAP[dueDateMatch[1].toLowerCase()]
    if (mm) {
      paymentDueDate = `${dueDateMatch[3]}-${mm}-${dueDateMatch[2].padStart(2, "0")}`
    }
  }

  // Current Balance = total amount due
  const balanceMatch = /Current\s+Balance\s+\$?([\d,]+\.\d{2})/i.exec(allText)
  if (balanceMatch) totalAmountDue = parseAmount(balanceMatch[1])

  // Minimum payment
  const minPayMatch =
    /Total\s+Minimum\s+Payment\s+\$?([\d,]+\.\d{2})/i.exec(allText)
  if (minPayMatch) minimumPayment = parseAmount(minPayMatch[1])

  // Balance breakdown line: "7,292.44 7,292.44 967.32 0.00 0.19 967.51"
  const breakdownMatch =
    /(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})/.exec(
      allText
    )
  if (breakdownMatch) {
    previousBalance = parseAmount(breakdownMatch[1])
    paymentsCredits = parseAmount(breakdownMatch[2])
    purchasesAdvances = parseAmount(breakdownMatch[3])
    interestCharges = parseAmount(breakdownMatch[4])
    feesCharges = parseAmount(breakdownMatch[5])
  }

  // Determine statement year/month for date resolution
  let stmtYear = new Date().getFullYear()
  let stmtMonthNum = 1
  if (stmtDateMatch) {
    const mm = MONTH_MAP[stmtDateMatch[1].toLowerCase()]
    stmtYear = Number.parseInt(stmtDateMatch[3])
    stmtMonthNum = Number.parseInt(mm || "1")
  }

  // Parse transactions
  let currentTxn: {
    date: string
    descLines: string[]
    amount: number
    isCredit: boolean
    rawLines: string[]
    cardSuffix?: string
  } | null = null
  let stopped = false

  for (const page of pages) {
    if (stopped) break
    const lines = page.split("\n")

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Check stop markers
      if (STOP_MARKERS.some((m) => trimmed.startsWith(m))) {
        if (currentTxn) {
          transactions.push(finalizeCitiTxn(currentTxn))
          currentTxn = null
        }
        if (
          trimmed.startsWith("GRAND TOTAL") ||
          trimmed.startsWith("Important") ||
          trimmed.startsWith("MOVING?") ||
          trimmed.startsWith("THIS PAGE")
        ) {
          stopped = true
          break
        }
        continue
      }

      // Skip noise
      if (SKIP_LINES.some((m) => trimmed.startsWith(m))) continue
      if (/^\d{4}$/.test(trimmed)) continue // "0000"
      if (/^\d{13,}$/.test(trimmed)) continue // card number on its own line

      // Card suffix line
      if (CARD_SUFFIX.test(trimmed)) {
        if (currentTxn) {
          currentTxn.cardSuffix = trimmed.slice(-4)
        }
        continue
      }

      // Try transaction start
      const txnMatch = TXN_START.exec(trimmed)
      if (txnMatch) {
        // Flush previous
        if (currentTxn) {
          transactions.push(finalizeCitiTxn(currentTxn))
        }

        const dayStr = txnMatch[1]
        const monthStr = txnMatch[2]
        const rest = trimmed.slice(txnMatch[0].length)

        // Extract amount (last number on line, possibly parenthesized)
        const parenMatch = /\(([\d,]+\.\d{2})\)\s*$/.exec(rest)
        let amount: number
        let isCredit: boolean
        let descPart: string

        if (parenMatch) {
          amount = parseAmount(parenMatch[1]) ?? 0
          isCredit = true
          descPart = rest.slice(0, rest.lastIndexOf("(")).trim()
        } else {
          const amountMatch = /([\d,]+\.\d{2})\s*$/.exec(rest)
          amount = amountMatch ? (parseAmount(amountMatch[1]) ?? 0) : 0
          isCredit = false
          descPart = amountMatch
            ? rest.slice(0, rest.lastIndexOf(amountMatch[1])).trim()
            : rest
        }

        currentTxn = {
          date: resolveDateDDMMM(
            dayStr,
            monthStr,
            stmtYear,
            stmtMonthNum
          ),
          descLines: descPart ? [descPart] : [],
          amount,
          isCredit,
          rawLines: [trimmed],
        }
      }
      // Not a transaction start and not a card suffix — could be continuation
      // But Citibank txns are typically single-line, so we skip unknown lines
    }
  }

  // Flush final
  if (currentTxn) {
    transactions.push(finalizeCitiTxn(currentTxn))
  }

  return {
    layout: "cc",
    transactions,
    cardNumber,
    cardName,
    statementMonth,
    statementDate,
    paymentDueDate,
    totalAmountDue,
    minimumPayment,
    previousBalance,
    paymentsCredits,
    purchasesAdvances,
    interestCharges,
    feesCharges,
  }
}

function finalizeCitiTxn(txn: {
  date: string
  descLines: string[]
  amount: number
  isCredit: boolean
  rawLines: string[]
  cardSuffix?: string
}): ParsedTransaction {
  const description = txn.descLines.join(" ").trim()
  const amount = txn.isCredit ? txn.amount : -txn.amount
  const txnType: "debit" | "credit" = txn.isCredit ? "credit" : "debit"

  // Detect payments
  const excludeFromSpending =
    /FAST INCOMING PAYMENT/i.test(description)

  return {
    date: txn.date,
    description,
    amount,
    balance: null,
    txnType,
    categoryName: "",
    excludeFromSpending,
    rawText: txn.rawLines.join("\n"),
  }
}
