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

type CitibankMetadata = {
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
  stmtYear: number
  stmtMonthNum: number
}

const LONG_MONTH_RE_SRC =
  "(January|February|March|April|May|June|July|August|September|October|November|December)"

function extractStatementDate(
  allText: string,
): { statementDate: string; statementMonth: string; stmtYear: number; stmtMonthNum: number } | null {
  const re = new RegExp(
    String.raw`Statement\s+Date:?\s+${LONG_MONTH_RE_SRC}\s+(\d{1,2}),?\s+(\d{4})`,
    "i",
  )
  const match = re.exec(allText)
  if (!match) return null
  const mm = MONTH_MAP[match[1].toLowerCase()]
  if (!mm) return null
  const dd = match[2].padStart(2, "0")
  return {
    statementDate: `${match[3]}-${mm}-${dd}`,
    statementMonth: `${match[3]}-${mm}-01`,
    stmtYear: Number.parseInt(match[3]),
    stmtMonthNum: Number.parseInt(mm),
  }
}

function extractPaymentDueDate(allText: string): string | null {
  const re = new RegExp(
    String.raw`Payment\s+Due\s+Date:?\s+${LONG_MONTH_RE_SRC}\s+(\d{1,2}),?\s+(\d{4})`,
    "i",
  )
  const match = re.exec(allText)
  if (!match) return null
  const mm = MONTH_MAP[match[1].toLowerCase()]
  if (!mm) return null
  return `${match[3]}-${mm}-${match[2].padStart(2, "0")}`
}

function extractCardName(allText: string): string | null {
  if (allText.includes("CITI PREMIERMILES")) return "Citi PremierMiles"
  if (allText.includes("CITI REWARDS")) return "Citi Rewards"
  return null
}

function extractBalanceBreakdown(allText: string): {
  previousBalance: number | null
  paymentsCredits: number | null
  purchasesAdvances: number | null
  interestCharges: number | null
  feesCharges: number | null
} {
  const moneyToken = String.raw`\d[\d,]*\.\d{2}`
  const breakdownRe = new RegExp(
    String.raw`(${moneyToken})\s+(${moneyToken})\s+(${moneyToken})\s+(${moneyToken})\s+(${moneyToken})\s+(${moneyToken})`,
  )
  const m = breakdownRe.exec(allText)
  if (!m) {
    return {
      previousBalance: null,
      paymentsCredits: null,
      purchasesAdvances: null,
      interestCharges: null,
      feesCharges: null,
    }
  }
  return {
    previousBalance: parseAmount(m[1]),
    paymentsCredits: parseAmount(m[2]),
    purchasesAdvances: parseAmount(m[3]),
    interestCharges: parseAmount(m[4]),
    feesCharges: parseAmount(m[5]),
  }
}

function extractCitibankMetadata(allText: string): CitibankMetadata {
  const cardNumMatch = /(\d{4}\s+\d{4}\s+\d{4}\s+\d{4})/.exec(allText)
  const cardNumber = cardNumMatch
    ? cardNumMatch[1].replaceAll(/\s+/g, "-")
    : null

  const stmt = extractStatementDate(allText)
  const balanceMatch = /Current\s+Balance\s+\$?([\d,]+\.\d{2})/i.exec(allText)
  const minPayMatch =
    /Total\s+Minimum\s+Payment\s+\$?([\d,]+\.\d{2})/i.exec(allText)
  const breakdown = extractBalanceBreakdown(allText)

  return {
    cardNumber,
    cardName: extractCardName(allText),
    statementMonth: stmt?.statementMonth ?? null,
    statementDate: stmt?.statementDate ?? null,
    paymentDueDate: extractPaymentDueDate(allText),
    totalAmountDue: balanceMatch ? parseAmount(balanceMatch[1]) : null,
    minimumPayment: minPayMatch ? parseAmount(minPayMatch[1]) : null,
    ...breakdown,
    stmtYear: stmt?.stmtYear ?? new Date().getFullYear(),
    stmtMonthNum: stmt?.stmtMonthNum ?? 1,
  }
}

type CurrentCitiTxn = {
  date: string
  descLines: string[]
  amount: number
  isCredit: boolean
  rawLines: string[]
  cardSuffix?: string
}

function parseTxnAmount(rest: string): {
  amount: number
  isCredit: boolean
  descPart: string
} {
  const parenMatch = /\(([\d,]+\.\d{2})\)\s*$/.exec(rest)
  if (parenMatch) {
    return {
      amount: parseAmount(parenMatch[1]) ?? 0,
      isCredit: true,
      descPart: rest.slice(0, rest.lastIndexOf("(")).trim(),
    }
  }
  const amountMatch = /([\d,]+\.\d{2})\s*$/.exec(rest)
  if (!amountMatch) {
    return { amount: 0, isCredit: false, descPart: rest }
  }
  return {
    amount: parseAmount(amountMatch[1]) ?? 0,
    isCredit: false,
    descPart: rest.slice(0, rest.lastIndexOf(amountMatch[1])).trim(),
  }
}

function buildTxnFromLine(
  trimmed: string,
  txnMatch: RegExpExecArray,
  stmtYear: number,
  stmtMonthNum: number,
): CurrentCitiTxn {
  const dayStr = txnMatch[1]
  const monthStr = txnMatch[2]
  const rest = trimmed.slice(txnMatch[0].length)
  const { amount, isCredit, descPart } = parseTxnAmount(rest)
  return {
    date: resolveDateDDMMM(dayStr, monthStr, stmtYear, stmtMonthNum),
    descLines: descPart ? [descPart] : [],
    amount,
    isCredit,
    rawLines: [trimmed],
  }
}

function isHardStopMarker(trimmed: string): boolean {
  return (
    trimmed.startsWith("GRAND TOTAL") ||
    trimmed.startsWith("Important") ||
    trimmed.startsWith("MOVING?") ||
    trimmed.startsWith("THIS PAGE")
  )
}

function shouldSkipLine(trimmed: string): boolean {
  if (!trimmed) return true
  if (SKIP_LINES.some((m) => trimmed.startsWith(m))) return true
  if (/^\d{4}$/.test(trimmed)) return true
  if (/^\d{13,}$/.test(trimmed)) return true
  return false
}

type LineOutcome = {
  completedTxn?: CurrentCitiTxn
  newTxn?: CurrentCitiTxn
  resetTxn?: boolean
  stop?: boolean
}

function handleCitibankLine(
  trimmed: string,
  currentTxn: CurrentCitiTxn | null,
  stmtYear: number,
  stmtMonthNum: number,
): LineOutcome {
  if (STOP_MARKERS.some((m) => trimmed.startsWith(m))) {
    return {
      completedTxn: currentTxn ?? undefined,
      resetTxn: true,
      stop: isHardStopMarker(trimmed),
    }
  }
  if (shouldSkipLine(trimmed)) return {}
  if (CARD_SUFFIX.test(trimmed)) {
    if (currentTxn) currentTxn.cardSuffix = trimmed.slice(-4)
    return {}
  }
  const txnMatch = TXN_START.exec(trimmed)
  if (txnMatch) {
    return {
      completedTxn: currentTxn ?? undefined,
      newTxn: buildTxnFromLine(trimmed, txnMatch, stmtYear, stmtMonthNum),
    }
  }
  return {}
}

function parseCitibankTransactions(
  pages: string[],
  stmtYear: number,
  stmtMonthNum: number,
): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  let currentTxn: CurrentCitiTxn | null = null

  for (const page of pages) {
    let stopped = false
    for (const line of page.split("\n")) {
      const trimmed = line.trim()
      const outcome = handleCitibankLine(
        trimmed,
        currentTxn,
        stmtYear,
        stmtMonthNum,
      )
      if (outcome.completedTxn) {
        transactions.push(finalizeCitiTxn(outcome.completedTxn))
      }
      if (outcome.newTxn) {
        currentTxn = outcome.newTxn
      } else if (outcome.resetTxn) {
        currentTxn = null
      }
      if (outcome.stop) {
        stopped = true
        break
      }
    }
    if (stopped) break
  }

  if (currentTxn) transactions.push(finalizeCitiTxn(currentTxn))
  return transactions
}

export function parseCitibankCcStatement(
  pages: string[],
): CitibankCcParseResult {
  const allText = pages.join("\n")
  const meta = extractCitibankMetadata(allText)
  const transactions = parseCitibankTransactions(
    pages,
    meta.stmtYear,
    meta.stmtMonthNum,
  )

  return {
    layout: "cc",
    transactions,
    cardNumber: meta.cardNumber,
    cardName: meta.cardName,
    statementMonth: meta.statementMonth,
    statementDate: meta.statementDate,
    paymentDueDate: meta.paymentDueDate,
    totalAmountDue: meta.totalAmountDue,
    minimumPayment: meta.minimumPayment,
    previousBalance: meta.previousBalance,
    paymentsCredits: meta.paymentsCredits,
    purchasesAdvances: meta.purchasesAdvances,
    interestCharges: meta.interestCharges,
    feesCharges: meta.feesCharges,
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
