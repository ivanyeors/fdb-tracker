import type { IlpExtractionResult, ExtractionWarning } from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replaceAll(/[$,\s]/g, "")
  const num = Number.parseFloat(cleaned)
  return Number.isNaN(num) ? null : num
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", september: "09", oct: "10", october: "10",
  nov: "11", november: "11", dec: "12", december: "12",
}

function extractMonth(text: string): string | null {
  // "as at DD Mon YYYY"
  const asAt =
    /as\s+at\s+\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i.exec(
      text
    )
  if (asAt) {
    const mm = MONTH_MAP[asAt[1].toLowerCase()]
    if (mm) return `${asAt[2]}-${mm}-01`
  }

  // "Statement Date: DD/MM/YYYY"
  const stmtDate =
    /statement\s+date\s*:?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i.exec(text)
  if (stmtDate) {
    return `${stmtDate[3]}-${stmtDate[2].padStart(2, "0")}-01`
  }

  // General "Month YYYY" near statement/report keywords
  const monthYear =
    /(?:statement|report|period)\s+(?:for\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i.exec(
      text
    )
  if (monthYear) {
    const mm = MONTH_MAP[monthYear[1].toLowerCase()]
    if (mm) return `${monthYear[2]}-${mm}-01`
  }

  return null
}

export function extractIlp(text: string): IlpExtractionResult {
  const warnings: ExtractionWarning[] = []

  // Product name
  let productName: string | null = null
  const namePatterns = [
    /(?:policy|product|plan)\s+name\s*:?\s*(.{5,80})/i,
    /(?:fund|investment)\s+name\s*:?\s*(.{5,80})/i,
  ]
  for (const pat of namePatterns) {
    const match = pat.exec(text)
    if (match) {
      productName = match[1].trim().split("\n")[0].trim()
      break
    }
  }
  if (!productName) warnings.push({ field: "productName", message: "Could not extract product name" })

  const month = extractMonth(text)
  if (!month) warnings.push({ field: "month", message: "Could not determine statement month" })

  // Fund value / Policy value
  let fundValue: number | null = null
  const valuePatterns = [
    /(?:total\s+)?fund\s+value\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /(?:total\s+)?policy\s+value\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /(?:total\s+)?account\s+value\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /surrender\s+value\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
  ]
  for (const pat of valuePatterns) {
    const match = pat.exec(text)
    if (match) {
      fundValue = parseAmount(match[1])
      if (fundValue !== null) break
    }
  }
  if (fundValue === null) warnings.push({ field: "fundValue", message: "Could not extract fund value" })

  // Premiums paid
  let premiumsPaid: number | null = null
  const premiumMatch =
    /(?:total\s+)?premiums?\s+paid\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i.exec(
      text
    )
  if (premiumMatch) {
    premiumsPaid = parseAmount(premiumMatch[1])
  }

  return {
    docType: "ilp_statement",
    productName,
    month,
    fundValue,
    premiumsPaid,
    warnings,
  }
}
