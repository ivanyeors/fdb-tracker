import type {
  InsuranceExtractionResult,
  ExtractionWarning,
} from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[$,\s]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

const INSURER_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\bAIA\b/g, name: "AIA" },
  { pattern: /prudential/i, name: "Prudential" },
  { pattern: /great\s+eastern/i, name: "Great Eastern" },
  { pattern: /ntuc\s+income|income\s+insurance/i, name: "NTUC Income" },
  { pattern: /\bsinglife\b/i, name: "Singlife" },
  { pattern: /\bmanulife\b/i, name: "Manulife" },
  { pattern: /tokio\s+marine/i, name: "Tokio Marine" },
  { pattern: /\bFWD\b/g, name: "FWD" },
  { pattern: /\baviva\b/i, name: "Aviva" },
  { pattern: /etiqa/i, name: "Etiqa" },
  { pattern: /china\s+life/i, name: "China Life" },
  { pattern: /hsbc\s+life/i, name: "HSBC Life" },
]

function detectInsurer(text: string): string | null {
  for (const { pattern, name } of INSURER_PATTERNS) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0
      return name
    }
    pattern.lastIndex = 0
  }
  return null
}

/** Detect insurance policy type from text keywords. */
function detectPolicyType(text: string): string | null {
  const lower = text.toLowerCase()
  if (/personal\s+accident/i.test(text)) return "personal_accident"
  if (/integrated\s+shield|shield\s+plan|medishield/i.test(text)) return "integrated_shield"
  if (/critical\s+illness/i.test(text)) return "critical_illness"
  if (/early\s+critical\s+illness/i.test(text)) return "early_critical_illness"
  if (/multi[- ]pay\s+ci/i.test(text)) return "multi_pay_ci"
  if (/investment[- ]linked/i.test(text)) return "ilp"
  if (/endowment/i.test(text)) return "endowment"
  if (/whole\s+life/i.test(text)) return "whole_life"
  if (/universal\s+life/i.test(text)) return "universal_life"
  if (/term\s+life/i.test(text)) return "term_life"
  if (/disability\s+income/i.test(text)) return "disability_income"
  if (/long[- ]term\s+care/i.test(text)) return "long_term_care"
  if (lower.includes("tpd") || /total\s+.{0,20}permanent\s+disability/i.test(text)) return "tpd"
  return null
}

function detectCoverageType(text: string): string | null {
  if (/personal\s+accident/i.test(text)) return "personal_accident"
  if (/critical\s+illness/i.test(text)) return "critical_illness"
  if (/hospitali[sz]ation/i.test(text)) return "hospitalization"
  if (/death\s+benefit|sum\s+(assured|insured)/i.test(text)) return "death"
  if (/disability/i.test(text)) return "disability"
  return null
}

function extractPolicyNumber(text: string): string | null {
  // Common patterns: "Policy No. L12345678", "Policy Number: ABC-123456"
  const match = text.match(
    /policy\s+(?:no\.?|number)\s*:?\s*([A-Z0-9][-A-Z0-9/]{4,20})/i
  )
  return match ? match[1].trim() : null
}

function extractPremium(text: string): { amount: number | null; frequency: string | null } {
  // "Premium: $123.45" or "Annual Premium $1,234.00" or "Total Premium Payable ... $500.00"
  const premiumMatch = text.match(
    /(?:total\s+)?(?:annual|yearly|monthly|quarterly)?\s*premium\s*(?:payable|amount)?\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i
  )
  const amount = premiumMatch ? parseAmount(premiumMatch[1]) : null

  let frequency: string | null = null
  if (premiumMatch) {
    const prefix = premiumMatch[0].toLowerCase()
    if (prefix.includes("annual") || prefix.includes("yearly")) frequency = "yearly"
    else if (prefix.includes("monthly")) frequency = "monthly"
    else if (prefix.includes("quarterly")) frequency = "quarterly"
  }

  // If no frequency detected, look near premium mentions
  if (!frequency && amount) {
    if (/per\s+annum|p\.?a\.?|annually|yearly/i.test(text)) frequency = "yearly"
    else if (/per\s+month|monthly/i.test(text)) frequency = "monthly"
  }

  return { amount, frequency }
}

function extractCoverageAmount(text: string): number | null {
  const patterns = [
    /sum\s+(?:assured|insured)\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /coverage\s+amount\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /benefit\s+amount\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    /accidental\s+death\s*.*?\$?\s*([\d,]+\.?\d{0,2})/i,
  ]
  for (const pat of patterns) {
    const match = text.match(pat)
    if (match) {
      const val = parseAmount(match[1])
      if (val && val >= 1000) return val
    }
  }
  return null
}

function extractDate(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  if (!match) return null
  // Try to parse the date portion after the label
  const dateArea = match[0]
  // DD/MM/YYYY
  const slashDate = dateArea.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (slashDate) {
    const d = slashDate[1].padStart(2, "0")
    const m = slashDate[2].padStart(2, "0")
    return `${slashDate[3]}-${m}-${d}`
  }
  // DD Mon YYYY
  const longDate = dateArea.match(
    /(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  if (longDate) {
    const MONTH_MAP: Record<string, string> = {
      jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
      apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
      aug: "08", august: "08", sep: "09", september: "09", oct: "10", october: "10",
      nov: "11", november: "11", dec: "12", december: "12",
    }
    const mm = MONTH_MAP[longDate[2].toLowerCase()]
    if (mm) return `${longDate[3]}-${mm}-${longDate[1].padStart(2, "0")}`
  }
  return null
}

function extractPolicyName(text: string): string | null {
  // Try to find the plan/product name near "Plan Name", "Product", or insurer-specific patterns
  const nameMatch = text.match(
    /(?:plan\s+name|product\s+name|policy\s+name|plan\s+type)\s*:?\s*(.{5,80})/i
  )
  if (nameMatch) return nameMatch[1].trim().split("\n")[0].trim()

  // AIA-specific: look for "AIA <product name>" pattern
  const aiaMatch = text.match(/\bAIA\s+([\w\s]+(?:Solitaire|Premier|Vitality|Pro|Plus|Elite)[\w\s]*)/i)
  if (aiaMatch) return `AIA ${aiaMatch[1].trim()}`

  return null
}

function extractRider(text: string): { name: string | null; premium: number | null } {
  const riderMatch = text.match(
    /rider\s*(?:name)?\s*:?\s*(.{3,60}?)(?:\n|rider\s+premium)/i
  )
  const riderPremiumMatch = text.match(
    /rider\s+premium\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i
  )
  return {
    name: riderMatch ? riderMatch[1].trim() : null,
    premium: riderPremiumMatch ? parseAmount(riderPremiumMatch[1]) : null,
  }
}

export function extractInsurance(text: string): InsuranceExtractionResult {
  const warnings: ExtractionWarning[] = []

  const insurer = detectInsurer(text)
  if (!insurer) warnings.push({ field: "insurer", message: "Could not detect insurer" })

  const policyNumber = extractPolicyNumber(text)
  if (!policyNumber) warnings.push({ field: "policyNumber", message: "Could not extract policy number" })

  const name = extractPolicyName(text)
  if (!name) warnings.push({ field: "name", message: "Could not extract policy name" })

  const type = detectPolicyType(text)
  if (!type) warnings.push({ field: "type", message: "Could not determine policy type" })

  const { amount: premiumAmount, frequency } = extractPremium(text)
  if (premiumAmount === null) warnings.push({ field: "premiumAmount", message: "Could not extract premium amount" })

  const coverageAmount = extractCoverageAmount(text)
  const coverageType = detectCoverageType(text)

  const inceptionDate = extractDate(text, /(?:inception|commencement|effective|start)\s+date\s*:?[^]*?(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+\w+\s+\d{4})/i)
  const endDate = extractDate(text, /(?:expiry|end|maturity|termination)\s+date\s*:?[^]*?(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+\w+\s+\d{4})/i)

  const rider = extractRider(text)

  return {
    docType: "insurance_policy",
    insurer,
    policyNumber,
    name,
    type,
    premiumAmount,
    frequency,
    coverageAmount,
    coverageType,
    inceptionDate,
    endDate,
    riderName: rider.name,
    riderPremium: rider.premium,
    warnings,
  }
}
