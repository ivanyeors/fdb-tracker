import type { CpfExtractionResult, ExtractionWarning } from "@/lib/pdf-import/types"
import { MONTH_NAME_SRC } from "@/lib/pdf-import/parsers/common"

/**
 * Parse a dollar amount from text, handling commas and optional dollar signs.
 */
function parseAmount(str: string): number | null {
  const cleaned = str.replaceAll(/[$,\s]/g, "")
  const num = Number.parseFloat(cleaned)
  return Number.isNaN(num) ? null : num
}

/**
 * Try to extract a statement month from CPF text.
 * Looks for patterns like "as at 31 Dec 2025", "Statement for December 2025", etc.
 */
function extractMonth(text: string): string | null {
  // "as at DD Mon YYYY" or "as at DD Month YYYY"
  const asAtRe = new RegExp(
    String.raw`as\s+at\s+\d{1,2}\s+(${MONTH_NAME_SRC})\s+(\d{4})`,
    "i",
  )
  const asAt = asAtRe.exec(text)
  if (asAt) {
    return resolveMonth(asAt[1], asAt[2])
  }

  // "Statement for Month YYYY"
  const stmtForRe = new RegExp(
    String.raw`statement\s+for\s+(${MONTH_NAME_SRC})\s+(\d{4})`,
    "i",
  )
  const stmtFor = stmtForRe.exec(text)
  if (stmtFor) {
    return resolveMonth(stmtFor[1], stmtFor[2])
  }

  // "DD/MM/YYYY" or "DD-MM-YYYY" date near keywords
  const dateMatch = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(text)
  if (dateMatch) {
    const month = Number.parseInt(dateMatch[2], 10)
    const year = Number.parseInt(dateMatch[3], 10)
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-01`
    }
  }

  return null
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
}

function resolveMonth(monthStr: string, yearStr: string): string | null {
  const mm = MONTH_MAP[monthStr.toLowerCase()]
  if (!mm) return null
  return `${yearStr}-${mm}-01`
}

/**
 * Extract a balance for a CPF account type.
 * Looks for patterns like "Ordinary Account ... $123,456.78"
 */
function extractBalance(text: string, accountPattern: RegExp): number | null {
  const match = accountPattern.exec(text)
  if (!match) return null
  // Look for a dollar amount near the match
  const afterMatch = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 200)
  const amountMatch = /(?:S?\$)?\s*([\d,]+\.\d{2})/.exec(afterMatch)
  if (amountMatch) {
    return parseAmount(amountMatch[1])
  }
  return null
}

export function extractCpf(text: string): CpfExtractionResult {
  const warnings: ExtractionWarning[] = []

  const month = extractMonth(text)
  if (!month) {
    warnings.push({ field: "month", message: "Could not determine statement month" })
  }

  const oa = extractBalance(text, /ordinary\s+account/i)
  if (oa === null) {
    warnings.push({ field: "oa", message: "Could not extract Ordinary Account balance" })
  }

  const sa = extractBalance(text, /special\s+account/i)
  if (sa === null) {
    warnings.push({ field: "sa", message: "Could not extract Special Account balance" })
  }

  const ma = extractBalance(text, /medisave\s+account|medisave/i)
  if (ma === null) {
    warnings.push({ field: "ma", message: "Could not extract MediSave Account balance" })
  }

  return { docType: "cpf_statement", month, oa, sa, ma, warnings }
}
