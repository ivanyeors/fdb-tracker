import type {
  BankStatementExtractionResult,
  ExtractionWarning,
} from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[$,\s]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

const BANK_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
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

function detectBank(text: string): string | null {
  for (const { pattern, name } of BANK_PATTERNS) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0
      return name
    }
    pattern.lastIndex = 0
  }
  return null
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", september: "09", oct: "10", october: "10",
  nov: "11", november: "11", dec: "12", december: "12",
}

function extractMonth(text: string): string | null {
  // "Statement for January 2026" or "Statement Period: 01 Jan 2026 to 31 Jan 2026"
  const stmtFor = text.match(
    /statement\s+(?:for|period)[^]*?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (stmtFor) {
    const mm = MONTH_MAP[stmtFor[1].toLowerCase()]
    if (mm) return `${stmtFor[2]}-${mm}-01`
  }

  // "DD Mon YYYY" date pattern near "statement" keyword
  const datePattern = text.match(
    /(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (datePattern) {
    const mm = MONTH_MAP[datePattern[2].toLowerCase()]
    if (mm) return `${datePattern[3]}-${mm}-01`
  }

  return null
}

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

export function extractBankStatement(text: string): BankStatementExtractionResult {
  const warnings: ExtractionWarning[] = []

  const bankName = detectBank(text)
  if (!bankName) warnings.push({ field: "bankName", message: "Could not detect bank name" })

  const month = extractMonth(text)
  if (!month) warnings.push({ field: "month", message: "Could not determine statement month" })

  const openingBalance = extractBalance(text, [
    /opening\s+balance/i,
    /beginning\s+balance/i,
    /balance\s+brought?\s+forward/i,
  ])
  if (openingBalance === null) {
    warnings.push({ field: "openingBalance", message: "Could not extract opening balance" })
  }

  const closingBalance = extractBalance(text, [
    /closing\s+balance/i,
    /ending\s+balance/i,
    /balance\s+carried?\s+forward/i,
  ])
  if (closingBalance === null) {
    warnings.push({ field: "closingBalance", message: "Could not extract closing balance" })
  }

  return {
    docType: "bank_statement",
    bankName,
    month,
    openingBalance,
    closingBalance,
    warnings,
  }
}
