import type { LoanExtractionResult, ExtractionWarning } from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[$,\s]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", september: "09", oct: "10", october: "10",
  nov: "11", november: "11", dec: "12", december: "12",
}

function detectLender(text: string): string | null {
  const lenders: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /\bDBS\b/g, name: "DBS" },
    { pattern: /\bOCBC\b/g, name: "OCBC" },
    { pattern: /\bUOB\b/g, name: "UOB" },
    { pattern: /standard\s+chartered/i, name: "Standard Chartered" },
    { pattern: /\bHSBC\b/g, name: "HSBC" },
    { pattern: /\bHDB\b/g, name: "HDB" },
    { pattern: /citibank/i, name: "Citibank" },
    { pattern: /maybank/i, name: "Maybank" },
  ]
  for (const { pattern, name } of lenders) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0
      return name
    }
    pattern.lastIndex = 0
  }
  return null
}

function detectLoanType(text: string): string | null {
  if (/housing\s+loan|home\s+loan|mortgage/i.test(text)) return "housing"
  if (/car\s+loan|vehicle\s+loan|auto\s+loan/i.test(text)) return "car"
  if (/education\s+loan|study\s+loan|student\s+loan/i.test(text)) return "education"
  if (/personal\s+loan|unsecured\s+loan/i.test(text)) return "personal"
  return null
}

function detectPropertyType(text: string): string | null {
  if (/\bHDB\b/g.test(text)) return "hdb"
  if (/private\s+property|condominium|condo|landed/i.test(text)) return "private"
  return null
}

function extractDate(text: string, labelPattern: RegExp): string | null {
  const match = text.match(labelPattern)
  if (!match) return null
  const area = text.slice(match.index ?? 0, (match.index ?? 0) + match[0].length + 100)

  // DD/MM/YYYY
  const slashDate = area.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (slashDate) {
    return `${slashDate[3]}-${slashDate[2].padStart(2, "0")}-${slashDate[1].padStart(2, "0")}`
  }

  // DD Mon YYYY
  const longDate = area.match(
    /(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (longDate) {
    const mm = MONTH_MAP[longDate[2].toLowerCase()]
    if (mm) return `${longDate[3]}-${mm}-${longDate[1].padStart(2, "0")}`
  }

  return null
}

export function extractLoan(text: string): LoanExtractionResult {
  const warnings: ExtractionWarning[] = []

  const lender = detectLender(text)
  if (!lender) warnings.push({ field: "lender", message: "Could not detect lender" })

  const type = detectLoanType(text)
  if (!type) warnings.push({ field: "type", message: "Could not determine loan type" })

  // Principal / Loan amount
  let principal: number | null = null
  const principalPatterns = [
    /(?:loan|principal)\s+amount\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /approved\s+(?:loan\s+)?amount\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /facility\s+amount\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
  ]
  for (const pat of principalPatterns) {
    const match = text.match(pat)
    if (match) {
      principal = parseAmount(match[1])
      if (principal !== null) break
    }
  }
  if (principal === null) warnings.push({ field: "principal", message: "Could not extract loan principal" })

  // Interest rate
  let ratePct: number | null = null
  const rateMatch = text.match(
    /(?:interest\s+rate|rate\s+of\s+interest)\s*:?\s*(\d+\.?\d{0,4})\s*%/i
  )
  if (rateMatch) {
    ratePct = parseFloat(rateMatch[1])
  }
  if (ratePct === null) warnings.push({ field: "ratePct", message: "Could not extract interest rate" })

  // Tenure
  let tenureMonths: number | null = null
  const tenureMatch = text.match(/(?:tenure|loan\s+period|repayment\s+period)\s*:?\s*(\d+)\s*(months?|years?)/i)
  if (tenureMatch) {
    const val = parseInt(tenureMatch[1], 10)
    tenureMonths = tenureMatch[2].toLowerCase().startsWith("year") ? val * 12 : val
  }
  if (tenureMonths === null) warnings.push({ field: "tenureMonths", message: "Could not extract tenure" })

  const startDate = extractDate(text, /(?:disbursement|commencement|start|effective)\s+date/i)

  const propertyType = type === "housing" ? detectPropertyType(text) : null

  const name = type
    ? `${lender ?? "Unknown"} ${type.charAt(0).toUpperCase() + type.slice(1)} Loan`
    : null

  return {
    docType: "loan_letter",
    lender,
    name,
    type,
    principal,
    ratePct,
    tenureMonths,
    startDate,
    propertyType,
    warnings,
  }
}
