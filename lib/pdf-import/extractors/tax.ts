import type {
  TaxExtractionResult,
  TaxNoaReliefBreakdown,
  TaxNoaBracketLine,
  ExtractionWarning,
} from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[$,\s]/g, "")
  const num = Number.parseFloat(cleaned)
  return Number.isNaN(num) ? null : num
}

/** Map NOA relief labels to normalized type keys */
function normalizeReliefType(label: string): string {
  const l = label.toLowerCase().trim()
  if (/earned\s+income/i.test(l)) return "earned_income"
  if (/provident\s+fund|cpf/i.test(l)) return "cpf_life_insurance"
  if (/life\s+insurance/i.test(l)) return "cpf_life_insurance"
  if (/nsman/i.test(l)) return "nsman"
  if (/\bsrs\b/i.test(l)) return "srs"
  if (/spouse/i.test(l)) return "spouse"
  if (/child/i.test(l)) return "qcr"
  if (/parent/i.test(l)) return "parent"
  if (/mother/i.test(l) || /wmcr/i.test(l)) return "wmcr"
  if (/course\s+fee/i.test(l)) return "course_fees"
  if (/cpf.*top/i.test(l)) return "cpf_topup"
  return "other"
}

export function extractTax(text: string): TaxExtractionResult {
  const warnings: ExtractionWarning[] = []

  // ── Year of Assessment ──
  let year: number | null = null
  const yoaMatch = text.match(/year\s+of\s+assessment\s*:?\s*(\d{4})/i)
  if (yoaMatch) {
    year = Number.parseInt(yoaMatch[1], 10)
  } else {
    const yaMatch = text.match(/\bYA\s*(\d{4})/i)
    if (yaMatch) year = Number.parseInt(yaMatch[1], 10)
  }
  if (!year) {
    warnings.push({
      field: "year",
      message: "Could not determine Year of Assessment",
    })
  }

  // ── Tax Payable ──
  let taxPayable: number | null = null
  const taxPatterns = [
    /tax\s+payable[^$\d]*(?:by\s+\d{1,2}\s+\w+\s+\d{4}\s*)?(?:S?\$)\s*([\d,]+\.?\d{0,2})/i,
    /tax\s+payable\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /net\s+tax\s+payable\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /total\s+tax\s+payable\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /amount\s+of\s+tax\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
  ]
  for (const pat of taxPatterns) {
    const match = text.match(pat)
    if (match) {
      taxPayable = parseAmount(match[1])
      if (taxPayable !== null) break
    }
  }
  if (taxPayable === null) {
    warnings.push({
      field: "taxPayable",
      message: "Could not extract tax payable amount",
    })
  }

  // ── Employment Income ──
  let employmentIncome: number | null = null
  // NOA pattern: "INCOME^ ($) 73,471.00" or "INCOME ($) 73,471.00"
  const incomeMatch = text.match(
    /INCOME\^?\s*\(\$\)\s*([\d,]+\.?\d{0,2})/i
  )
  if (incomeMatch) {
    employmentIncome = parseAmount(incomeMatch[1])
  } else {
    // Try "EMPLOYMENT 73,471.00" line
    const empMatch = text.match(
      /EMPLOYMENT\s+([\d,]+\.?\d{0,2})/i
    )
    if (empMatch) employmentIncome = parseAmount(empMatch[1])
  }

  // ── Chargeable Income ──
  let chargeableIncome: number | null = null
  const ciMatch = text.match(
    /CHARGEABLE\s+INCOME\s*(?:\(\$\))?\s*([\d,]+\.?\d{0,2})/i
  )
  if (ciMatch) chargeableIncome = parseAmount(ciMatch[1])

  // ── Total Deductions ──
  let totalDeductions: number | null = null
  const dedMatch = text.match(
    /DEDUCTIONS\s*\(\$\)\s*([\d,]+\.?\d{0,2})/i
  )
  if (dedMatch) totalDeductions = parseAmount(dedMatch[1])

  // ── Donations Deduction ──
  let donationsDeduction: number | null = null
  const donMatch = text.match(
    /DONATIONS?\s+([\d,]+\.?\d{0,2})/i
  )
  if (donMatch) donationsDeduction = parseAmount(donMatch[1])

  // ── Reliefs Total ──
  let reliefsTotal: number | null = null
  const relMatch = text.match(
    /RELIEFS?\s+([\d,]+\.?\d{0,2})/i
  )
  if (relMatch) reliefsTotal = parseAmount(relMatch[1])

  // ── Relief Breakdown ──
  // Parse individual relief lines like "Earned Income 1,000.00" or "NSman-self/ wife/ parent 1,500.00"
  const reliefs: TaxNoaReliefBreakdown[] = []
  const reliefPatterns: Array<{ pattern: RegExp; label: string }> = [
    {
      pattern: /Earned\s+Income\s+([\d,]+\.?\d{0,2})/i,
      label: "Earned Income",
    },
    {
      pattern:
        /NSman[\s-]*(?:self)?[/\s]*(?:wife)?[/\s]*(?:parent)?\s+([\d,]+\.?\d{0,2})/i,
      label: "NSman-self/wife/parent",
    },
    {
      pattern:
        /Provident\s+Fund[/\s]*Life\s*\n?\s*Insurance\s+([\d,]+\.?\d{0,2})/i,
      label: "Provident Fund/Life Insurance",
    },
    {
      pattern: /\bSRS\s+([\d,]+\.?\d{0,2})/i,
      label: "SRS",
    },
    {
      pattern: /Spouse\s+Relief\s+([\d,]+\.?\d{0,2})/i,
      label: "Spouse Relief",
    },
    {
      pattern: /Qualifying\s+Child\s+Relief\s+([\d,]+\.?\d{0,2})/i,
      label: "Qualifying Child Relief",
    },
    {
      pattern: /(?:Working\s+Mother|WMCR)\s+([\d,]+\.?\d{0,2})/i,
      label: "Working Mother's Child Relief",
    },
    {
      pattern: /Parent\s+(?:Relief|Maintenance)\s+([\d,]+\.?\d{0,2})/i,
      label: "Parent Relief",
    },
    {
      pattern: /Course\s+Fee[s]?\s+([\d,]+\.?\d{0,2})/i,
      label: "Course Fees",
    },
    {
      pattern: /CPF\s+(?:Cash\s+)?Top[\s-]?up\s+([\d,]+\.?\d{0,2})/i,
      label: "CPF Top-up",
    },
  ]
  for (const { pattern, label } of reliefPatterns) {
    const m = text.match(pattern)
    if (m) {
      const amount = parseAmount(m[1])
      if (amount !== null && amount > 0) {
        reliefs.push({
          type: normalizeReliefType(label),
          label,
          amount,
        })
      }
    }
  }

  // ── Tax Bracket Summary ──
  // Parse "First 40,000.00 550.00" and "Next 16,350.00 @ 7% 1,144.50"
  const bracketSummary: TaxNoaBracketLine[] = []

  // "First X Y" pattern (cumulative, no rate shown)
  const firstMatch = text.match(
    /First\s+([\d,]+\.?\d{0,2})\s+([\d,]+\.?\d{0,2})/i
  )
  if (firstMatch) {
    const income = parseAmount(firstMatch[1])
    const tax = parseAmount(firstMatch[2])
    if (income !== null && tax !== null) {
      bracketSummary.push({
        label: `First ${firstMatch[1]}`,
        income,
        rate: null,
        tax,
      })
    }
  }

  // "Next X @ Y% Z" patterns (can be multiple)
  const nextRegex =
    /Next\s+([\d,]+\.?\d{0,2})\s+@\s+([\d.]+)%\s+([\d,]+\.?\d{0,2})/gi
  let nextMatch: RegExpExecArray | null
  while ((nextMatch = nextRegex.exec(text)) !== null) {
    const income = parseAmount(nextMatch[1])
    const rate = Number.parseFloat(nextMatch[2])
    const tax = parseAmount(nextMatch[3])
    if (income !== null && !Number.isNaN(rate) && tax !== null) {
      bracketSummary.push({
        label: `Next ${nextMatch[1]} @ ${nextMatch[2]}%`,
        income,
        rate: rate / 100,
        tax,
      })
    }
  }

  // ── Payment Due Date ──
  let paymentDueDate: string | null = null
  // "by 26 May 2026" or "by 26 May, 2026"
  const dueDateMatch = text.match(
    /by\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i
  )
  if (dueDateMatch) {
    const day = Number.parseInt(dueDateMatch[1], 10)
    const monthStr = dueDateMatch[2]
    const yearStr = Number.parseInt(dueDateMatch[3], 10)
    const monthNames: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
      apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
      aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
      nov: 10, november: 10, dec: 11, december: 11,
    }
    const monthIndex = monthNames[monthStr.toLowerCase()]
    if (monthIndex !== undefined && !Number.isNaN(day) && !Number.isNaN(yearStr)) {
      const d = new Date(yearStr, monthIndex, day)
      paymentDueDate = d.toISOString().split("T")[0]
    }
  }

  // ── GIRO Detection ──
  const isOnGiro =
    /\bGIRO\b/i.test(text) &&
    /deduct(?:ed|ion)/i.test(text)

  return {
    docType: "tax_noa",
    year,
    taxPayable,
    employmentIncome,
    chargeableIncome,
    totalDeductions,
    donationsDeduction,
    reliefsTotal,
    paymentDueDate,
    reliefs,
    bracketSummary,
    isOnGiro,
    warnings,
  }
}
