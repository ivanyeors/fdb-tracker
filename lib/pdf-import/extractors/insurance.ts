import type {
  InsuranceExtractionResult,
  ExtractionWarning,
} from "@/lib/pdf-import/types"

function parseAmount(str: string): number | null {
  const cleaned = str.replace(/[S$,\s]/g, "")
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
  // "Premium: $123.45" or "Annual Premium $1,234.00" or "Total Premium Payable (with GST): S$500.00"
  const premiumMatch = text.match(
    /(?:total\s+)?(?:annual|yearly|monthly|quarterly)?\s*premium\s*(?:payable|amount)?(?:\s*\([^)]*\))?\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i
  )
  const amount = premiumMatch ? parseAmount(premiumMatch[1]) : null

  let frequency: string | null = null
  if (premiumMatch) {
    const prefix = premiumMatch[0].toLowerCase()
    if (prefix.includes("annual") || prefix.includes("yearly")) frequency = "yearly"
    else if (prefix.includes("monthly")) frequency = "monthly"
    else if (prefix.includes("quarterly")) frequency = "quarterly"
  }

  // Check "Payment Mode" field (e.g., "Payment Mode : Annual")
  if (!frequency) {
    const modeMatch = text.match(/payment\s+mode\s*:?\s*(annual|yearly|monthly|quarterly)/i)
    if (modeMatch) {
      const mode = modeMatch[1].toLowerCase()
      if (mode === "annual" || mode === "yearly") frequency = "yearly"
      else if (mode === "monthly") frequency = "monthly"
      else if (mode === "quarterly") frequency = "quarterly"
    }
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
    /sum\s+(?:assured|insured)\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /coverage\s+amount\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /benefit\s+amount\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /accidental\s+death\s*.*?(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
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

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", september: "09", oct: "10", october: "10",
  nov: "11", november: "11", dec: "12", december: "12",
}

const MONTH_NAMES_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"

function extractDate(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  if (!match) return null
  const dateArea = match[0]

  // DD/MM/YYYY or DD-MM-YYYY
  const slashDate = dateArea.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (slashDate) {
    const d = slashDate[1].padStart(2, "0")
    const m = slashDate[2].padStart(2, "0")
    return `${slashDate[3]}-${m}-${d}`
  }

  // DD Mon YYYY (e.g., "27 Dec 2025")
  const longDate = dateArea.match(
    new RegExp(`(\\d{1,2})\\s+(${MONTH_NAMES_RE})\\s+(\\d{4})`, "i")
  )
  if (longDate) {
    const mm = MONTH_MAP[longDate[2].toLowerCase()]
    if (mm) return `${longDate[3]}-${mm}-${longDate[1].padStart(2, "0")}`
  }

  // Mon DD, YYYY (e.g., "Dec 27, 2025")
  const monthFirstDate = dateArea.match(
    new RegExp(`(${MONTH_NAMES_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i")
  )
  if (monthFirstDate) {
    const mm = MONTH_MAP[monthFirstDate[1].toLowerCase()]
    if (mm) return `${monthFirstDate[3]}-${mm}-${monthFirstDate[2].padStart(2, "0")}`
  }

  return null
}

/** Scan all dates in text and return the latest one that is after minDate. */
function findLatestDate(text: string, minDate: string): string | null {
  let latest: string | null = null

  // Match Mon DD, YYYY
  const monthFirstRe = new RegExp(
    `(${MONTH_NAMES_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})`,
    "gi"
  )
  let m
  while ((m = monthFirstRe.exec(text)) !== null) {
    const mm = MONTH_MAP[m[1].toLowerCase()]
    if (mm) {
      const d = `${m[3]}-${mm}-${m[2].padStart(2, "0")}`
      if (d > minDate && (!latest || d > latest)) latest = d
    }
  }

  // Match DD Mon YYYY
  const dayFirstRe = new RegExp(
    `(\\d{1,2})\\s+(${MONTH_NAMES_RE})\\s+(\\d{4})`,
    "gi"
  )
  while ((m = dayFirstRe.exec(text)) !== null) {
    const mm = MONTH_MAP[m[2].toLowerCase()]
    if (mm) {
      const d = `${m[3]}-${mm}-${m[1].padStart(2, "0")}`
      if (d > minDate && (!latest || d > latest)) latest = d
    }
  }

  // Match DD/MM/YYYY
  const slashRe = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g
  while ((m = slashRe.exec(text)) !== null) {
    const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    if (d > minDate && (!latest || d > latest)) latest = d
  }

  return latest
}

function extractPolicyName(text: string): string | null {
  // Match "Plan Name:", "Product Name:", "Policy Name:", "Plan Type:", or bare "Plan:"
  // Capture up to 2 lines to handle wrapped plan names
  const nameMatch = text.match(
    /(?:plan(?:\s+(?:name|type))?|product\s+name|policy\s+name)\s*:\s*([^\n]{3,80}(?:\n[^\n]{3,80})?)/i
  )
  if (nameMatch) {
    let name = nameMatch[1]
      .split(/\n/)
      .slice(0, 2)
      .map((s) => s.trim())
      .join(" ")
    // Trim at next field label
    name = name.replace(
      /\s*(?:Renewal|Sum|Payment|Premium|Coverage|Inception|Effective|Expiry|End)\s.*/i,
      ""
    )
    return name.trim() || null
  }

  // AIA-specific: look for "AIA <product name>" pattern
  const aiaMatch = text.match(
    /\bAIA\s+([\w\s]*(?:Solitaire|Premier|Vitality|Pro|Plus|Elite)[\w\s]*)/i
  )
  if (aiaMatch) {
    let name = `AIA ${aiaMatch[1].trim()}`
    name = name.replace(
      /\s*(?:Renewal|Sum|Payment|Premium|Coverage|Inception|Effective)\s.*/i,
      ""
    )
    return name.trim()
  }

  return null
}

function extractRider(text: string): { name: string | null; premium: number | null } {
  const riderMatch = text.match(
    /rider\s*(?:name)?\s*:?\s*(.{3,60}?)(?:\n|rider\s+premium)/i
  )
  const riderPremiumMatch = text.match(
    /rider\s+premium\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i
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

  const DATE_PART = String.raw`\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}`
  const inceptionDate = extractDate(text, new RegExp(`(?:inception|commencement|effective|start|renewal)\\s+date\\s*:?[^]*?(?:${DATE_PART})`, "i"))

  // For end date, try label-based extraction first
  let endDate = extractDate(text, new RegExp(`(?:expiry|end|maturity|termination|coverage\\s+expiry)\\s+date\\s*:?[^]*?(?:${DATE_PART})`, "i"))

  // If end date is missing or earlier than inception (table header grabbed wrong date),
  // scan for the latest date in the document — far-future dates are typically coverage expiry
  if (inceptionDate && (!endDate || endDate <= inceptionDate)) {
    endDate = findLatestDate(text, inceptionDate)
  }

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
