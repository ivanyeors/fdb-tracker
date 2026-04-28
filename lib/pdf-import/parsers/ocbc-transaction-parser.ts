/**
 * OCBC Bank Statement + Credit Card Statement transaction parser.
 *
 * Parses individual transactions from text extracted by unpdf (per-page, with line breaks).
 *
 * Bank statement transaction lines from unpdf look like:
 *   "06 JAN 3,635.15 62,850.5406 JAN IBG GIRO"
 * Pattern: DD MMM [amount?] [balance][DD MMM] [description]
 *
 * CC statement transaction lines look like:
 *   " 07/12 PAYMENT BY INTERNET (28.57)"
 *   " 30/11 CURSOR, AI POWERED IDE 26.82"
 */

import {
  MONTH_MAP,
  MONTH_NAME_SRC,
  resolveDateDDMMM,
  resolveDateDDSlashMM,
  parseAmount,
} from "@/lib/pdf-import/parsers/common"

export type StatementLayout = "bank" | "cc"

export interface ParsedTransaction {
  date: string
  valueDate?: string
  description: string
  amount: number
  balance: number | null
  txnType: "debit" | "credit"
  categoryName: string
  foreignCurrency?: string
  excludeFromSpending: boolean
  rawText: string
}

export interface BankParseResult {
  layout: "bank"
  transactions: ParsedTransaction[]
  accountNumber: string | null
  statementMonth: string | null
  openingBalance: number | null
  closingBalance: number | null
  totalWithdrawals: number | null
  totalDeposits: number | null
}

export interface CcParseResult {
  layout: "cc"
  transactions: ParsedTransaction[]
  cardNumber: string | null
  statementMonth: string | null
  statementDate: string | null
  paymentDueDate: string | null
  totalAmountDue: number | null
  minimumPayment: number | null
}

// ── Regex patterns ──

/** Matches "DD MMM" at line start — bank statement transaction start */
const BANK_TXN_START =
  /^(\d{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+/i

/** Matches the mashed value-date + description after amounts:
 *  e.g. "62,850.5406 JAN IBG GIRO" → balance=62850.54, valueDate="06 JAN", desc="IBG GIRO"
 */
const BALANCE_VALUEDATE_DESC =
  /([\d,]+\.\d{2})(\d{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(.*)/i

/** Matches "DD/MM" at line start (with optional leading spaces) — CC transaction start */
const CC_TXN_START = /^\s*(\d{2})\/(\d{2})\s+/

/** Matches dollar amounts like "3,635.15" or "967.51" */
const AMOUNT_RE = /([\d,]+\.\d{2})/g

/** Matches parenthesized amounts like "(28.57)" */
const _PAREN_AMOUNT_RE = /\(([\d,]+\.\d{2})\)/

// ── Stop / skip markers ──

const BANK_STOP_MARKERS = [
  "BALANCE B/F",
  "BALANCE C/F",
  "Total Withdrawals",
  "Total Interest Paid",
  "Average Balance",
  "CHECK YOUR STATEMENT",
  "UPDATING YOUR",
  "OCBC PROMOTION",
]

const BANK_SKIP_MARKERS = [
  "TRANSACTION CODE DESCRIPTION",
  "OCBC Bank",
  "65 Chulia Street",
  "Deposit Insurance",
  "STATEMENT OF ACCOUNT",
  "Page ",
  "RNB0",
  "Transaction\n",
  "Date Date Description",
  "360 ACCOUNT",
  "Account No.",
  "JAN 2026 TO",
  "FEB 2026 TO",
  "MAR 2026 TO",
  "APR 2026 TO",
  "MAY 2026 TO",
  "JUN 2026 TO",
  "JUL 2026 TO",
  "AUG 2026 TO",
  "SEP 2026 TO",
  "OCT 2026 TO",
  "NOV 2025 TO",
  "DEC 2025 TO",
]

const CC_STOP_MARKERS = [
  "SUBTOTAL",
  "SUB-TOTAL",
  "TOTAL",
  "TOTAL AMOUNT DUE",
  "NEWS & INFORMATION",
  "YOUR REWARDS",
  "IMPORTANT INFORMATION",
  "Prepared for",
  "Please detach",
]

// ── Bank Statement Parser ──

export function parseOcbcBankStatement(pages: string[]): BankParseResult {
  const transactions: ParsedTransaction[] = []
  let accountNumber: string | null = null
  let statementMonth: string | null = null
  let openingBalance: number | null = null
  let closingBalance: number | null = null
  let totalWithdrawals: number | null = null
  let totalDeposits: number | null = null

  // Extract metadata from all pages
  const allText = pages.join("\n")

  const acctMatch = /Account No\.\s*(\d{10,})/.exec(allText)
  if (acctMatch) accountNumber = acctMatch[1]

  const periodRe = new RegExp(
    `(\\d{1,2})\\s+(${MONTH_NAME_SRC})\\s+(\\d{4})\\s+TO\\s+(\\d{1,2})\\s+(${MONTH_NAME_SRC})\\s+(\\d{4})`,
    "i",
  )
  const periodMatch = periodRe.exec(allText)
  let stmtYear = new Date().getFullYear()
  let stmtMonthNum = 1
  if (periodMatch) {
    const endMM = MONTH_MAP[periodMatch[5].toLowerCase()]
    stmtYear = Number.parseInt(periodMatch[6])
    stmtMonthNum = Number.parseInt(endMM || "1")
    statementMonth = `${stmtYear}-${endMM}-01`
  }

  // Parse BALANCE B/F
  const bfMatch = /([\d,]+\.\d{2})BALANCE B\/F/.exec(allText)
  if (bfMatch) openingBalance = parseAmount(bfMatch[1])

  // Parse BALANCE C/F
  const cfMatch = /([\d,]+\.\d{2})BALANCE C\/F/.exec(allText)
  if (cfMatch) closingBalance = parseAmount(cfMatch[1])

  // Parse totals
  const totalsMatch =
    /Total Withdrawals\/Deposits[\s\S]*?([\d,]+\.\d{2})([\d,]+\.\d{2})/.exec(
      allText
    )
  if (totalsMatch) {
    // In the text: "3,726.912,088.60" — deposits then withdrawals mashed together
    // Actually from the extracted text: "3,726.912,088.60" means deposits=3726.91, withdrawals=2088.60
    // But we need to check the order. From the PDF visual: Withdrawal column then Deposit column
    // In the text it appears as: deposits amount + withdrawals amount (reversed from visual)
    totalDeposits = parseAmount(totalsMatch[1])
    totalWithdrawals = parseAmount(totalsMatch[2])
  }

  // Process each page for transactions
  let currentTxn: {
    txnDate: string
    valueDate: string
    descLines: string[]
    amount: number | null
    balance: number | null
    rawLines: string[]
    foreignCurrency?: string
  } | null = null
  let prevBalance = openingBalance

  for (const page of pages) {
    const lines = page.split("\n")

    // Skip the transaction code legend page (page 2 of 4-page stmts)
    const isLegendPage = lines.some(
      (l) =>
        l.includes("TRANSACTION CODE") && l.includes("DESCRIPTION")
    )
    if (isLegendPage) continue

    let inTransactionSection = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Check for transaction section start (after header)
      if (
        trimmed.includes("JAN 2026 TO") ||
        trimmed.includes("FEB 2026 TO") ||
        trimmed.includes("MAR 2026 TO") ||
        trimmed.includes("NOV 2025 TO") ||
        trimmed.includes("DEC 2025 TO") ||
        /\d{1,2}\s+[A-Z]{3}\s+\d{4}\s+TO\s+\d{1,2}\s+[A-Z]{3}\s+\d{4}/i.test(
          trimmed
        )
      ) {
        inTransactionSection = true
        continue
      }

      // Skip non-transaction lines
      if (!inTransactionSection) continue

      // Check for BALANCE B/F line
      if (trimmed.includes("BALANCE B/F")) continue

      // Check for stop markers
      if (
        BANK_STOP_MARKERS.some((m) =>
          trimmed.toUpperCase().includes(m.toUpperCase())
        )
      ) {
        // Flush current transaction
        if (currentTxn) {
          transactions.push(finalizeBankTxn(currentTxn, stmtYear, stmtMonthNum, prevBalance))
          prevBalance = currentTxn.balance ?? prevBalance
          currentTxn = null
        }
        inTransactionSection = false
        continue
      }

      // Skip page header/noise lines
      if (
        BANK_SKIP_MARKERS.some((m) =>
          trimmed.includes(m)
        )
      ) {
        continue
      }

      // Try to match a transaction start line
      const txnMatch = BANK_TXN_START.exec(trimmed)
      if (txnMatch) {
        // Flush previous transaction
        if (currentTxn) {
          transactions.push(finalizeBankTxn(currentTxn, stmtYear, stmtMonthNum, prevBalance))
          prevBalance = currentTxn.balance ?? prevBalance
        }

        // Parse the transaction start line
        // Format: "DD MMM [amount?] balance[DD MMM] description"
        const dayStr = txnMatch[1]
        const monthStr = txnMatch[2]
        const rest = trimmed.slice(txnMatch[0].length)

        // Try to match: amount balance+valueDate description
        const bvdMatch = BALANCE_VALUEDATE_DESC.exec(rest)
        if (bvdMatch) {
          // Has amount(s) before the balance+valueDate
          const beforeBalance = rest.slice(0, rest.indexOf(bvdMatch[0]))
          const amounts = [...beforeBalance.matchAll(AMOUNT_RE)]
          const txnAmount =
            amounts.length > 0
              ? parseAmount(amounts[0][1])
              : null
          const balance = parseAmount(bvdMatch[1])
          const vDay = bvdMatch[2]
          const vMonth = bvdMatch[3]
          const desc = bvdMatch[4].trim()

          currentTxn = {
            txnDate: resolveDateDDMMM(dayStr, monthStr, stmtYear, stmtMonthNum),
            valueDate: resolveDateDDMMM(vDay, vMonth, stmtYear, stmtMonthNum),
            descLines: desc ? [desc] : [],
            amount: txnAmount,
            balance,
            rawLines: [trimmed],
          }
        } else {
          // Fallback: just amounts on the line
          const amounts = [...rest.matchAll(AMOUNT_RE)]
          currentTxn = {
            txnDate: resolveDateDDMMM(dayStr, monthStr, stmtYear, stmtMonthNum),
            valueDate: resolveDateDDMMM(dayStr, monthStr, stmtYear, stmtMonthNum),
            descLines: [],
            amount:
              amounts.length > 0 ? parseAmount(amounts[0][1]) : null,
            balance:
              amounts.length > 1 ? parseAmount(amounts[1][1]) : null,
            rawLines: [trimmed],
          }
        }
      } else if (currentTxn) {
        // Continuation line — append to description
        currentTxn.rawLines.push(trimmed)

        // Check for foreign currency
        const fcyMatch = /^(USD|EUR|GBP|JPY|AUD|CNY)\s+([\d,.]+)$/.exec(trimmed)
        if (fcyMatch) {
          currentTxn.foreignCurrency = `${fcyMatch[1]} ${fcyMatch[2]}`
        } else {
          currentTxn.descLines.push(trimmed)
        }
      }
    }
  }

  // Flush final transaction
  if (currentTxn) {
    transactions.push(finalizeBankTxn(currentTxn, stmtYear, stmtMonthNum, prevBalance))
  }

  return {
    layout: "bank",
    transactions,
    accountNumber,
    statementMonth,
    openingBalance,
    closingBalance,
    totalWithdrawals,
    totalDeposits,
  }
}

function finalizeBankTxn(
  txn: {
    txnDate: string
    valueDate: string
    descLines: string[]
    amount: number | null
    balance: number | null
    rawLines: string[]
    foreignCurrency?: string
  },
  _stmtYear: number,
  _stmtMonth: number,
  prevBalance: number | null
): ParsedTransaction {
  const description = txn.descLines.join(" ").trim()
  let amount = txn.amount ?? 0

  // Determine debit/credit from balance change
  let txnType: "debit" | "credit" = "debit"
  if (prevBalance !== null && txn.balance !== null && amount !== 0) {
    if (txn.balance > prevBalance) {
      txnType = "credit"
      amount = Math.abs(amount)
    } else {
      amount = -Math.abs(amount)
    }
  } else if (amount > 0) {
    // Heuristic: if description suggests income
    if (
      /SALARY|BONUS INTEREST|INTEREST CREDIT|FUND TRANSFER.*from/i.test(
        description
      )
    ) {
      txnType = "credit"
    } else {
      amount = -Math.abs(amount)
    }
  }

  // Detect CC payments and transfers → exclude from spending
  const excludeFromSpending = isCcPayment(description) || isInternalTransfer(description)

  return {
    date: txn.txnDate,
    valueDate: txn.valueDate,
    description,
    amount,
    balance: txn.balance,
    txnType,
    categoryName: "", // Filled by categorizeTransaction later
    foreignCurrency: txn.foreignCurrency,
    excludeFromSpending,
    rawText: txn.rawLines.join("\n"),
  }
}

// ── CC Statement Parser ──

export function parseOcbcCcStatement(pages: string[]): CcParseResult {
  const transactions: ParsedTransaction[] = []
  let cardNumber: string | null = null
  let statementMonth: string | null = null
  let statementDate: string | null = null
  let paymentDueDate: string | null = null
  let totalAmountDue: number | null = null
  let minimumPayment: number | null = null

  const allText = pages.join("\n")

  // Extract metadata
  const cardMatch = /(\d{4}-\d{4}-\d{4}-\d{4})/.exec(allText)
  if (cardMatch) cardNumber = cardMatch[1]

  // Match "STATEMENT DATE" label then date on same or next line
  const stmtDateMatch =
    /STATEMENT\s+DATE\s+(\d{2})-(\d{2})-(\d{4})/i.exec(allText)
  if (stmtDateMatch) {
    statementDate = `${stmtDateMatch[3]}-${stmtDateMatch[2]}-${stmtDateMatch[1]}`
    statementMonth = `${stmtDateMatch[3]}-${stmtDateMatch[2]}-01`
  } else {
    // Fallback: find standalone DD-MM-YYYY pattern early in the text
    const standaloneDate = /^(\d{2})-(\d{2})-(\d{4})\s/m.exec(allText)
    if (standaloneDate) {
      statementDate = `${standaloneDate[3]}-${standaloneDate[2]}-${standaloneDate[1]}`
      statementMonth = `${standaloneDate[3]}-${standaloneDate[2]}-01`
    }
  }

  const dueDateMatch =
    /PAYMENT\s+DUE\s+DATE\s+(\d{2})-(\d{2})-(\d{4})/i.exec(allText)
  if (dueDateMatch) {
    paymentDueDate = `${dueDateMatch[3]}-${dueDateMatch[2]}-${dueDateMatch[1]}`
  }

  const totalDueMatch = /TOTAL\s+AMOUNT\s+DUE\s+([\d,]+\.\d{2})/i.exec(allText)
  if (totalDueMatch) totalAmountDue = parseAmount(totalDueMatch[1])

  // OCBC CC: "TOTAL MINIMUM DUE" header is on one line, values on next:
  // "01-02-2026 24-02-2026 S$2,000 S$1,529.89 S$50.00"
  // The minimum payment is the last S$ amount on that line.
  // Strategy: find the values line (starts with DD-MM-YYYY) after the header line
  const minPayHeaderIdx = allText.search(/TOTAL\s+MINIMUM\s+(?:DUE|PAYMENT)/i)
  if (minPayHeaderIdx >= 0) {
    const afterHeader = allText.slice(minPayHeaderIdx)
    // Find the line with DD-MM-YYYY values
    const valuesLine = /\n([^\n]*\d{2}-\d{2}-\d{4}[^\n]*)/.exec(afterHeader)
    if (valuesLine) {
      // Get all S$ amounts on that line
      const amounts = [...valuesLine[1].matchAll(/S\$([\d,]+(?:\.\d{2})?)/g)]
      if (amounts.length > 0) {
        // Last S$ amount is the minimum payment
        minimumPayment = parseAmount(amounts.at(-1)![1])
      }
    }
  }
  // Also try inline format: "TOTAL MINIMUM DUE S$50.00"
  if (minimumPayment === null) {
    const inlineMatch =
      /TOTAL\s+MINIMUM\s+(?:DUE|PAYMENT)\s+S?\$?([\d,]+\.\d{2})/i.exec(allText)
    if (inlineMatch) minimumPayment = parseAmount(inlineMatch[1])
  }

  // Parse statement year/month for date resolution
  let stmtYear = new Date().getFullYear()
  let stmtMonthNum = 1
  if (stmtDateMatch) {
    stmtYear = Number.parseInt(stmtDateMatch[3])
    stmtMonthNum = Number.parseInt(stmtDateMatch[2])
  }

  // Parse transactions from each page
  let currentTxn: {
    date: string
    descLines: string[]
    amount: number
    isCredit: boolean
    rawLines: string[]
    foreignCurrency?: string
  } | null = null

  for (const page of pages) {
    const lines = page.split("\n")

    // Find transaction header
    let inTxnSection = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Start of transaction section
      if (
        trimmed.includes("TRANSACTION DATE") &&
        trimmed.includes("DESCRIPTION")
      ) {
        inTxnSection = true
        continue
      }

      if (!inTxnSection) continue

      // Stop markers — also check after stripping a leading mashed amount
      // (unpdf produces "470.11SUBTOTAL" instead of "SUBTOTAL")
      const withoutLeadingAmount = trimmed.replace(/^[\d,]+\.\d{2}/, "")
      if (
        CC_STOP_MARKERS.some((m) => {
          const upper = m.toUpperCase()
          return (
            trimmed.toUpperCase().startsWith(upper) ||
            withoutLeadingAmount.toUpperCase().startsWith(upper)
          )
        })
      ) {
        if (currentTxn) {
          transactions.push(finalizeCcTxn(currentTxn))
          currentTxn = null
        }
        inTxnSection = false
        continue
      }

      // Skip card info lines
      if (trimmed.startsWith("OCBC 365") || trimmed.startsWith("OCBC FRANK")) continue
      if (/^YEO\s+/.exec(trimmed)) continue
      if (/^\d{4}-\d{4}-\d{4}-\d{4}/.exec(trimmed)) continue

      // Skip LAST MONTH'S BALANCE
      if (trimmed.includes("LAST MONTH'S BALANCE")) continue

      // Try CC transaction line: " DD/MM description amount"
      const ccMatch = CC_TXN_START.exec(line)
      if (ccMatch) {
        // Flush previous
        if (currentTxn) {
          transactions.push(finalizeCcTxn(currentTxn))
        }

        const day = ccMatch[1]
        const month = ccMatch[2]
        const rest = line.slice(ccMatch[0].length).trim()

        // Extract amount + description.
        // unpdf produces amount-before-description (mashed):
        //   Credit: "(53.25PAYMENT BY INTERNET )"
        //   Debit:  "29.20-5563 CURSOR, AI POWERED"
        // Old/test format had amount-after-description — keep as fallback.
        let amount: number
        let isCredit: boolean
        let descPart: string

        // New format: credit with amount mashed inside parens
        const newCreditMatch = /^\(([\d,]+\.\d{2})(.*?)\)\s*$/.exec(rest)
        // Old format: credit with amount at end in parens
        const oldCreditMatch = /\(([\d,]+\.\d{2})\)\s*$/.exec(rest)

        if (newCreditMatch) {
          amount = parseAmount(newCreditMatch[1]) ?? 0
          isCredit = true
          descPart = newCreditMatch[2].trim()
        } else if (oldCreditMatch) {
          amount = parseAmount(oldCreditMatch[1]) ?? 0
          isCredit = true
          descPart = rest.slice(0, rest.lastIndexOf("(")).trim()
        } else {
          // Debit: try amount-before-description first
          const newDebitMatch = /^([\d,]+\.\d{2})(.+)$/.exec(rest)
          // Fallback: amount-after-description
          const oldDebitMatch = /([\d,]+\.\d{2})\s*$/.exec(rest)

          if (newDebitMatch) {
            amount = parseAmount(newDebitMatch[1]) ?? 0
            isCredit = false
            descPart = newDebitMatch[2].trim()
          } else if (oldDebitMatch) {
            amount = parseAmount(oldDebitMatch[1]) ?? 0
            isCredit = false
            descPart = rest
              .slice(0, rest.lastIndexOf(oldDebitMatch[1]))
              .trim()
          } else {
            amount = 0
            isCredit = false
            descPart = rest
          }
        }

        const dateStr = `${day}/${month}`
        currentTxn = {
          date: resolveDateDDSlashMM(dateStr, stmtYear, stmtMonthNum),
          descLines: descPart ? [descPart] : [],
          amount,
          isCredit,
          rawLines: [line.trim()],
        }
      } else if (currentTxn) {
        // Continuation line
        currentTxn.rawLines.push(trimmed)

        // Check for FOREIGN CURRENCY line
        const fcyMatch =
          /^FOREIGN\s+CURRENCY\s+(USD|EUR|GBP|JPY|AUD|CNY)\s+([\d,.]+)/i.exec(
            trimmed
          )
        if (fcyMatch) {
          currentTxn.foreignCurrency = `${fcyMatch[1]} ${fcyMatch[2]}`
        } else {
          currentTxn.descLines.push(trimmed)
        }
      }
    }
  }

  // Flush final
  if (currentTxn) {
    transactions.push(finalizeCcTxn(currentTxn))
  }

  return {
    layout: "cc",
    transactions,
    cardNumber,
    statementMonth,
    statementDate,
    paymentDueDate,
    totalAmountDue,
    minimumPayment,
  }
}

function finalizeCcTxn(txn: {
  date: string
  descLines: string[]
  amount: number
  isCredit: boolean
  rawLines: string[]
  foreignCurrency?: string
}): ParsedTransaction {
  const description = txn.descLines.join(" ").trim()
  const amount = txn.isCredit ? txn.amount : -txn.amount
  const txnType: "debit" | "credit" = txn.isCredit ? "credit" : "debit"

  // Detect CC payments
  const excludeFromSpending =
    /PAYMENT BY INTERNET|PAYMENT BY GIRO/i.test(description)

  return {
    date: txn.date,
    description,
    amount,
    balance: null,
    txnType,
    categoryName: "",
    foreignCurrency: txn.foreignCurrency,
    excludeFromSpending,
    rawText: txn.rawLines.join("\n"),
  }
}

// ── Layout Detection ──

export function detectOcbcLayout(text: string): StatementLayout | null {
  // CC: has "TRANSACTION DATE" + "DESCRIPTION" + "AMOUNT (SGD)"
  if (
    /TRANSACTION\s+DATE/i.test(text) &&
    /AMOUNT\s*\(SGD\)/i.test(text)
  ) {
    return "cc"
  }

  // Bank: has "Withdrawal" + "Deposit" + "Balance" columns
  if (
    /Withdrawal/i.test(text) &&
    /Deposit/i.test(text) &&
    /Balance/i.test(text)
  ) {
    return "bank"
  }

  return null
}

// ── Helpers ──

function isCcPayment(description: string): boolean {
  const upper = description.toUpperCase()
  return (
    upper.includes("CREDIT CARD") ||
    upper.includes("BILL PAYMENT INB") ||
    // Check for CC card number patterns (16 consecutive digits)
    /\d{16}/.test(description.replaceAll(/[-\s]/g, "")) ||
    /PAYMENT BY INTERNET|PAYMENT BY GIRO|FAST INCOMING PAYMENT/i.test(description)
  )
}

function isInternalTransfer(description: string): boolean {
  const upper = description.toUpperCase()
  // Investment platform transfers
  if (upper.includes("TO IBKR") || upper.includes("INVS-")) return true
  if (upper.includes("TO SYFE") || upper.includes("TO ENDOWUS")) return true
  if (upper.includes("TO STASHAWAY") || upper.includes("TO TIGER")) return true
  // Own account transfers (common SG patterns)
  if (upper.includes("OWN ACCOUNT TRANSFER")) return true
  if (upper.includes("TRANSFER TO SAVINGS") || upper.includes("TRANSFER TO MSA")) return true
  return false
}

// ── Auto-categorization ──

export interface CategoryRule {
  pattern: string
  categoryName: string
  priority: number
}

/**
 * Categorize a transaction by matching description against rules.
 * Returns category name (to be resolved to category_id at save time).
 */
export function categorizeTransaction(
  description: string,
  rules: CategoryRule[]
): string {
  const descUpper = description.toUpperCase()

  // Sort by priority DESC
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)

  // Special case: Grab disambiguation
  if (descUpper.includes("GRAB")) {
    if (
      descUpper.includes("GRAB FOOD") ||
      descUpper.includes("GRABFOOD")
    ) {
      // Check if user has a rule for this
      const foodRule = sorted.find(
        (r) =>
          descUpper.includes(r.pattern.toUpperCase()) &&
          r.categoryName === "Food & Dining"
      )
      if (foodRule) return foodRule.categoryName
      return "Food & Dining"
    }
    // Non-food Grab = transport
    const transportRule = sorted.find(
      (r) => r.pattern.toUpperCase() === "GRAB" || r.pattern === "Grab*"
    )
    if (transportRule) return transportRule.categoryName
    return "Transport"
  }

  for (const rule of sorted) {
    const pattern = rule.pattern.toUpperCase().replaceAll("*", "")
    if (descUpper.includes(pattern)) {
      return rule.categoryName
    }
  }

  return "Others"
}
