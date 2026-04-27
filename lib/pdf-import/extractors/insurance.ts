import type {
  InsuranceExtractionResult,
  InsuranceBenefitEntry,
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

// ─── Benefit table parser (insurer-agnostic) ────────────────────────────

/** Map benefit header text to standard DB coverage_type enum values. */
const BENEFIT_TYPE_MAP: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /accidental\s+death/i, type: "death" },
  { pattern: /death\s+benefit/i, type: "death" },
  { pattern: /double\s+indemnity/i, type: "death" },
  { pattern: /permanent\s+total\s+disablement/i, type: "tpd" },
  { pattern: /\btpd\b/i, type: "tpd" },
  { pattern: /early\s+critical\s+illness/i, type: "early_critical_illness" },
  { pattern: /critical\s+illness/i, type: "critical_illness" },
  { pattern: /dismemberment/i, type: "personal_accident" },
  { pattern: /personal\s+accident/i, type: "personal_accident" },
  { pattern: /medical\s+reimbursement/i, type: "medical_reimbursement" },
  { pattern: /hospitali[sz]ation/i, type: "hospitalization" },
  { pattern: /disability\s+income/i, type: "disability" },
  { pattern: /weekly\s+income/i, type: "disability" },
  { pattern: /long[- ]?term\s+care/i, type: "long_term_care" },
]

function mapBenefitCoverageType(header: string): string | null {
  for (const { pattern, type } of BENEFIT_TYPE_MAP) {
    if (pattern.test(header)) return type
  }
  return null
}

/** Clean up a benefit section header into a readable name. */
function cleanBenefitName(header: string): string {
  return header
    .replace(/\s+/g, " ")
    .trim()
    .split(/\n/)[0]
    .trim()
    // Title-case: uppercase first letter of each word, lowercase the rest
    .replace(/\b\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

/** Known benefit section header patterns (uppercase in SG insurance docs). */
const BENEFIT_HEADER_RE = new RegExp(
  [
    "ACCIDENTAL\\s+DEATH\\s+BENEFIT",
    "ACC(?:IDENTAL)?\\s+DISMEMBERMENT(?:\\s+AND\\s+BURNS)?",
    "PERMANENT\\s+TOTAL\\s+DISABLEMENT",
    "DOUBLE\\s+INDEMNITY(?:\\s+ON\\s+ACC(?:IDENTAL)?\\s+DEATH)?",
    "ACC(?:IDENTAL)?\\s+MEDICAL\\s+REIMBURSEMENT",
    "TCM[/\\s]CHIROPRACTIC\\s+REIMBURSEMENT",
    "WEEKLY\\s+INCOME\\s+BENEFIT",
    "MOBILITY\\s+AIDS\\s+REIMBURSEMENT",
    "HOME\\s+MODIFICATION\\s+REIMB(?:URSEMENT)?",
    "FAMILY\\s+SUPPORT\\s+FUND\\s+BENEFIT",
    "CRITICAL\\s+ILLNESS\\s+(?:BENEFIT|COVER(?:AGE)?)",
    "EARLY\\s+CRITICAL\\s+ILLNESS",
    "DEATH\\s+(?:AND\\s+TPD\\s+)?BENEFIT",
    "TPD\\s+BENEFIT",
    "DISABILITY\\s+INCOME\\s+BENEFIT",
    "LONG[- ]?TERM\\s+CARE\\s+BENEFIT",
    "HOSPITALI[SZ]ATION\\s+BENEFIT",
    "TOTAL\\s+(?:AND\\s+)?PERMANENT\\s+DISABILITY",
  ].join("|"),
  "gi"
)

/** Parse a date from a text fragment (standalone, no label prefix needed). */
function parseDateFromFragment(fragment: string): string | null {
  // Mon DD, YYYY
  const mf = fragment.match(
    new RegExp(`(${MONTH_NAMES_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i")
  )
  if (mf) {
    const mm = MONTH_MAP[mf[1].toLowerCase()]
    if (mm) return `${mf[3]}-${mm}-${mf[2].padStart(2, "0")}`
  }
  // DD Mon YYYY
  const df = fragment.match(
    new RegExp(`(\\d{1,2})\\s+(${MONTH_NAMES_RE})\\s+(\\d{4})`, "i")
  )
  if (df) {
    const mm = MONTH_MAP[df[2].toLowerCase()]
    if (mm) return `${df[3]}-${mm}-${df[1].padStart(2, "0")}`
  }
  // DD/MM/YYYY
  const sf = fragment.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (sf) {
    return `${sf[3]}-${sf[2].padStart(2, "0")}-${sf[1].padStart(2, "0")}`
  }
  return null
}

const AMOUNT_RE = /(?:S?\$)\s*([\d,]+\.?\d{0,2})/g

function extractBenefits(text: string): InsuranceBenefitEntry[] {
  const benefits: InsuranceBenefitEntry[] = []

  // Find all benefit header positions
  const headers: Array<{ name: string; index: number }> = []
  let hMatch
  BENEFIT_HEADER_RE.lastIndex = 0
  while ((hMatch = BENEFIT_HEADER_RE.exec(text)) !== null) {
    headers.push({ name: hMatch[0], index: hMatch.index })
  }

  if (headers.length === 0) return benefits

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + headers[i].name.length
    const end = i + 1 < headers.length ? headers[i + 1].index : Math.min(start + 500, text.length)
    const block = text.slice(start, end)

    // Extract all S$ amounts from the block
    const amounts: number[] = []
    AMOUNT_RE.lastIndex = 0
    let aMatch
    while ((aMatch = AMOUNT_RE.exec(block)) !== null) {
      const val = parseAmount(aMatch[1])
      if (val !== null) amounts.push(val)
    }

    if (amounts.length === 0) continue

    // Find all dates in the block
    const dates: string[] = []
    // Mon DD, YYYY
    const dateRe1 = new RegExp(
      `(${MONTH_NAMES_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})`,
      "gi"
    )
    let dMatch
    while ((dMatch = dateRe1.exec(block)) !== null) {
      const parsed = parseDateFromFragment(dMatch[0])
      if (parsed) dates.push(parsed)
    }
    // DD Mon YYYY
    const dateRe2 = new RegExp(
      `(\\d{1,2})\\s+(${MONTH_NAMES_RE})\\s+(\\d{4})`,
      "gi"
    )
    while ((dMatch = dateRe2.exec(block)) !== null) {
      const parsed = parseDateFromFragment(dMatch[0])
      if (parsed) dates.push(parsed)
    }
    // DD/MM/YYYY
    const dateRe3 = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g
    while ((dMatch = dateRe3.exec(block)) !== null) {
      const parsed = parseDateFromFragment(dMatch[0])
      if (parsed) dates.push(parsed)
    }

    // Heuristic: largest amount = coverage, second largest = renewal bonus, smallest = premium
    const sorted = [...amounts].sort((a, b) => b - a)
    const coverageAmount = sorted[0]
    let renewalBonus: number | null = null
    let benefitPremium: number | null = null

    if (sorted.length >= 3) {
      renewalBonus = sorted[1]
      benefitPremium = sorted[sorted.length - 1]
    } else if (sorted.length === 2) {
      // Two amounts: larger = coverage, smaller = premium
      benefitPremium = sorted[1]
    }

    // Expiry date: latest date in block (start date is earliest)
    const expiryDate =
      dates.length > 0
        ? [...dates].sort((a, b) => b.localeCompare(a))[0]
        : null

    benefits.push({
      benefitName: cleanBenefitName(headers[i].name),
      coverageType: mapBenefitCoverageType(headers[i].name),
      coverageAmount,
      benefitPremium,
      renewalBonus,
      benefitExpiryDate: expiryDate,
    })
  }

  return benefits
}

// ─── New policy-level field extractors ───────────────────────────────────

function extractCpfPremium(text: string): number | null {
  const patterns = [
    /(?:cpf|medisave)\s+(?:oa\s+)?(?:deduction|premium|contribution)\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i,
    /cpf\s*:?\s*(?:S?\$)\s*([\d,]+\.?\d{0,2})/i,
  ]
  for (const pat of patterns) {
    const match = text.match(pat)
    if (match) {
      const val = parseAmount(match[1])
      if (val && val > 0) return val
    }
  }
  return null
}

function detectPremiumWaiver(text: string): boolean {
  return /(?:waiver\s+of\s+premium|premium\s+waiver|pwp)\b/i.test(text)
}

function extractCoverageTillAge(text: string): number | null {
  const match = text.match(
    /(?:coverage|covered?|term)\s+(?:till?|to|until)\s+age\s+(\d{2,3})/i
  )
  if (match) {
    const age = parseInt(match[1])
    if (age >= 20 && age <= 120) return age
  }
  return null
}

function extractSubType(text: string, policyType: string | null): string | null {
  if (policyType !== "integrated_shield") return null
  const match = text.match(/(?:ward\s+([ab]\d?)|private|semi[- ]private)/i)
  if (match) {
    const full = match[0].toLowerCase().trim()
    if (full.includes("private") && !full.includes("semi")) return "private"
    if (full.includes("semi")) return "semi_private"
    if (match[1]) return `ward_${match[1].toLowerCase()}`
  }
  return null
}

function extractCashValue(text: string): number | null {
  const match = text.match(
    /(?:cash|surrender)\s+value\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i
  )
  if (match) {
    const val = parseAmount(match[1])
    if (val && val > 0) return val
  }
  return null
}

function extractMaturityValue(text: string): number | null {
  const match = text.match(
    /(?:maturity|guaranteed)\s+(?:value|benefit|payout)\s*:?\s*(?:S?\$)?\s*([\d,]+\.?\d{0,2})/i
  )
  if (match) {
    const val = parseAmount(match[1])
    if (val && val > 0) return val
  }
  return null
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
  const benefits = extractBenefits(text)
  const cpfPremium = extractCpfPremium(text)
  const premiumWaiver = detectPremiumWaiver(text)
  const coverageTillAge = extractCoverageTillAge(text)
  const subType = extractSubType(text, type)
  const cashValue = extractCashValue(text)
  const maturityValue = extractMaturityValue(text)

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
    benefits,
    cpfPremium,
    premiumWaiver,
    coverageTillAge,
    subType,
    cashValue,
    maturityValue,
    warnings,
  }
}
