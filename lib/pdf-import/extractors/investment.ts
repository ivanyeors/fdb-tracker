import type {
  InvestmentExtractionResult,
  ExtractionWarning,
} from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[$,\s]/g, "")
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
  const stmtMatch = text.match(
    /(?:statement|report|as\s+at|period)[^]*?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (stmtMatch) {
    const mm = MONTH_MAP[stmtMatch[1].toLowerCase()]
    if (mm) return `${stmtMatch[2]}-${mm}-01`
  }
  return null
}

/**
 * Attempt to extract stock holdings from a portfolio statement.
 * This is best-effort — brokerage statements vary widely in format.
 */
function extractHoldings(text: string): Array<{
  symbol: string
  name: string
  units: number
  costBasis: number | null
}> {
  const holdings: Array<{
    symbol: string
    name: string
    units: number
    costBasis: number | null
  }> = []

  // Look for patterns like "AAPL Apple Inc 100 150.00"
  // or table rows with stock code, name, quantity
  const lines = text.split("\n")
  for (const line of lines) {
    // Try: SYMBOL_CODE ... some_name ... quantity ... price
    const stockMatch = line.match(
      /([A-Z][A-Z0-9]{1,5}(?:\.[A-Z]{2})?)\s+(.{3,40}?)\s+([\d,]+)\s+(?:(?:S?\$)?\s*)([\d,]+\.?\d{0,2})/
    )
    if (stockMatch) {
      const units = parseAmount(stockMatch[3])
      if (units && units > 0) {
        holdings.push({
          symbol: stockMatch[1],
          name: stockMatch[2].trim(),
          units,
          costBasis: parseAmount(stockMatch[4]),
        })
      }
    }
  }

  return holdings
}

export function extractInvestment(text: string): InvestmentExtractionResult {
  const warnings: ExtractionWarning[] = []

  const month = extractMonth(text)
  if (!month) warnings.push({ field: "month", message: "Could not determine statement month" })

  const holdings = extractHoldings(text)
  if (holdings.length === 0) {
    warnings.push({ field: "holdings", message: "Could not extract any holdings from statement" })
  }

  // Total portfolio value
  let totalValue: number | null = null
  const totalPatterns = [
    /total\s+(?:portfolio|market|account)\s+value\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /total\s+value\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /net\s+asset\s+value\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
  ]
  for (const pat of totalPatterns) {
    const match = text.match(pat)
    if (match) {
      totalValue = parseAmount(match[1])
      if (totalValue !== null) break
    }
  }

  return {
    docType: "investment_statement",
    holdings,
    totalValue,
    month,
    warnings,
  }
}
