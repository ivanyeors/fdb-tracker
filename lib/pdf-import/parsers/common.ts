/**
 * Shared utilities for statement parsers.
 * Extracted from bank-statement.ts for reuse across OCBC, Citibank, etc.
 */

export function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[$,\s]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export const BANK_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\bDBS\b/g, name: "DBS" },
  { pattern: /\bPOSB\b/g, name: "POSB" },
  { pattern: /\bOCBC\b/g, name: "OCBC" },
  { pattern: /\bUOB\b/g, name: "UOB" },
  { pattern: /standard\s+chartered/i, name: "Standard Chartered" },
  { pattern: /\bCIMB\b/g, name: "CIMB" },
  { pattern: /\bHSBC\b/g, name: "HSBC" },
  { pattern: /maybank/i, name: "Maybank" },
  { pattern: /citibank/i, name: "Citibank" },
]

export function detectBank(text: string): string | null {
  for (const { pattern, name } of BANK_PATTERNS) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0
      return name
    }
    pattern.lastIndex = 0
  }
  return null
}

export const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
}

/**
 * Extract statement month from text.
 * Returns ISO date string like "2026-01-01" or null.
 */
export function extractMonth(text: string): string | null {
  // "Statement for January 2026" or "Statement Period: 01 Jan 2026 to 31 Jan 2026"
  const stmtFor = text.match(
    /statement\s+(?:for|period)[^]*?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (stmtFor) {
    const mm = MONTH_MAP[stmtFor[1].toLowerCase()]
    if (mm) return `${stmtFor[2]}-${mm}-01`
  }

  // "1 JAN 2026 TO 31 JAN 2026" (OCBC bank statement period)
  const periodMatch = text.match(
    /\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\s+TO\s+\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (periodMatch) {
    // Use the end month
    const mm = MONTH_MAP[periodMatch[3].toLowerCase()]
    if (mm) return `${periodMatch[4]}-${mm}-01`
  }

  // "STATEMENT DATE DD-MM-YYYY" (OCBC CC format)
  const stmtDate = text.match(/STATEMENT\s+DATE\s+(\d{2})-(\d{2})-(\d{4})/i)
  if (stmtDate) {
    return `${stmtDate[3]}-${stmtDate[2]}-01`
  }

  // "Statement Date January 05, 2026" (Citibank format)
  const citiDate = text.match(
    /Statement\s+Date\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+(\d{4})/i
  )
  if (citiDate) {
    const mm = MONTH_MAP[citiDate[1].toLowerCase()]
    if (mm) return `${citiDate[2]}-${mm}-01`
  }

  // Fallback: "DD Mon YYYY" date pattern
  const datePattern = text.match(
    /(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (datePattern) {
    const mm = MONTH_MAP[datePattern[2].toLowerCase()]
    if (mm) return `${datePattern[3]}-${mm}-01`
  }

  return null
}

/**
 * Resolve a DD MMM date (e.g. "06 JAN") to ISO date using statement year/month.
 * Handles year boundary: if statement is Jan and txn is Feb, use same year.
 * If statement is Jan and txn is Dec, use previous year.
 */
export function resolveDateDDMMM(
  dayStr: string,
  monthStr: string,
  statementYear: number,
  statementMonth: number
): string {
  const mm = MONTH_MAP[monthStr.toLowerCase()]
  if (!mm) return `${statementYear}-01-${dayStr.padStart(2, "0")}`

  const txnMonth = parseInt(mm)
  let year = statementYear

  // If txn month is much larger than statement month, it's from previous year
  // e.g. statement = Jan (1), txn = Dec (12) → previous year
  if (txnMonth - statementMonth > 6) {
    year = statementYear - 1
  }
  // If txn month is much smaller than statement month, it's next year
  // e.g. statement = Dec (12), txn = Jan (1) → same year or next year
  if (statementMonth - txnMonth > 6) {
    year = statementYear + 1
  }

  return `${year}-${mm}-${dayStr.padStart(2, "0")}`
}

/**
 * Resolve a DD/MM date (e.g. "07/12") to ISO date using statement context.
 */
export function resolveDateDDSlashMM(
  dateStr: string,
  statementYear: number,
  statementMonth: number
): string {
  const parts = dateStr.split("/")
  if (parts.length !== 2) return `${statementYear}-01-01`

  const day = parts[0].padStart(2, "0")
  const month = parts[1].padStart(2, "0")
  const txnMonth = parseInt(month)
  let year = statementYear

  if (txnMonth - statementMonth > 6) {
    year = statementYear - 1
  }
  if (statementMonth - txnMonth > 6) {
    year = statementYear + 1
  }

  return `${year}-${month}-${day}`
}

/** Extract all dollar amounts from a string */
export function extractAmounts(line: string): number[] {
  const matches = [...line.matchAll(/([\d,]+\.\d{2})/g)]
  return matches
    .map((m) => parseAmount(m[1]))
    .filter((v): v is number => v !== null)
}

/** Check if an amount string is parenthesized (credit) */
export function isParenthesized(line: string, amount: string): boolean {
  const idx = line.indexOf(amount)
  if (idx <= 0) return false
  // Look for ( before the amount
  const before = line.slice(Math.max(0, idx - 3), idx).trim()
  const after = line.slice(idx + amount.length, idx + amount.length + 3).trim()
  return before.endsWith("(") && after.startsWith(")")
}
