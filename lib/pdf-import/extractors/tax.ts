import type { TaxExtractionResult, ExtractionWarning } from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[$,\s]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export function extractTax(text: string): TaxExtractionResult {
  const warnings: ExtractionWarning[] = []

  // Year of Assessment
  let year: number | null = null
  const yoaMatch = text.match(/year\s+of\s+assessment\s*:?\s*(\d{4})/i)
  if (yoaMatch) {
    year = parseInt(yoaMatch[1], 10)
  } else {
    // Try "YA 2025" pattern
    const yaMatch = text.match(/\bYA\s*(\d{4})/i)
    if (yaMatch) {
      year = parseInt(yaMatch[1], 10)
    }
  }
  if (!year) {
    warnings.push({ field: "year", message: "Could not determine Year of Assessment" })
  }

  // Tax payable
  let taxPayable: number | null = null
  const taxPatterns = [
    /tax\s+payable\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /net\s+tax\s+payable\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /total\s+tax\s+payable\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /amount\s+of\s+tax\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
  ]
  for (const pat of taxPatterns) {
    const match = text.match(pat)
    if (match) {
      taxPayable = parseAmount(match[1])
      if (taxPayable !== null) break
    }
  }
  if (taxPayable === null) {
    warnings.push({ field: "taxPayable", message: "Could not extract tax payable amount" })
  }

  return { docType: "tax_noa", year, taxPayable, warnings }
}
