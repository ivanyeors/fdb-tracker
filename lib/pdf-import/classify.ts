import {
  DOCUMENT_TYPES,
  type ClassificationResult,
  type DocumentType,
} from "@/lib/pdf-import/types"

interface KeywordRule {
  pattern: RegExp
  weight: number
  label: string
}

const RULES: Record<DocumentType, KeywordRule[]> = {
  cpf_statement: [
    { pattern: /central\s+provident\s+fund/i, weight: 10, label: "Central Provident Fund" },
    { pattern: /\bCPF\b/g, weight: 5, label: "CPF" },
    { pattern: /ordinary\s+account/i, weight: 6, label: "Ordinary Account" },
    { pattern: /special\s+account/i, weight: 6, label: "Special Account" },
    { pattern: /medisave/i, weight: 6, label: "MediSave" },
    { pattern: /retirement\s+account/i, weight: 3, label: "Retirement Account" },
    { pattern: /cpf\s+statement/i, weight: 8, label: "CPF Statement" },
    { pattern: /contribution\s+history/i, weight: 4, label: "Contribution History" },
  ],
  insurance_policy: [
    { pattern: /policy\s+schedule/i, weight: 8, label: "Policy Schedule" },
    { pattern: /renewal\s+certificate/i, weight: 8, label: "Renewal Certificate" },
    { pattern: /sum\s+(assured|insured)/i, weight: 7, label: "Sum Assured" },
    { pattern: /premium/i, weight: 4, label: "Premium" },
    { pattern: /\bAIA\b/g, weight: 6, label: "AIA" },
    { pattern: /prudential/i, weight: 6, label: "Prudential" },
    { pattern: /great\s+eastern/i, weight: 6, label: "Great Eastern" },
    { pattern: /ntuc\s+income/i, weight: 6, label: "NTUC Income" },
    { pattern: /\bsinglife\b/i, weight: 6, label: "Singlife" },
    { pattern: /\bmanulife\b/i, weight: 6, label: "Manulife" },
    { pattern: /tokio\s+marine/i, weight: 6, label: "Tokio Marine" },
    { pattern: /\bFWD\b/g, weight: 5, label: "FWD" },
    { pattern: /\baviva\b/i, weight: 5, label: "Aviva" },
    { pattern: /personal\s+accident/i, weight: 5, label: "Personal Accident" },
    { pattern: /critical\s+illness/i, weight: 5, label: "Critical Illness" },
    { pattern: /death\s+benefit/i, weight: 5, label: "Death Benefit" },
    { pattern: /life\s+assured/i, weight: 6, label: "Life Assured" },
    { pattern: /policyholder/i, weight: 4, label: "Policyholder" },
    { pattern: /coverage/i, weight: 3, label: "Coverage" },
    { pattern: /benefit\s+schedule/i, weight: 6, label: "Benefit Schedule" },
  ],
  bank_statement: [
    { pattern: /statement\s+of\s+account/i, weight: 8, label: "Statement of Account" },
    { pattern: /account\s+summary/i, weight: 6, label: "Account Summary" },
    { pattern: /\bDBS\b/g, weight: 5, label: "DBS" },
    { pattern: /\bPOSB\b/g, weight: 5, label: "POSB" },
    { pattern: /\bOCBC\b/g, weight: 5, label: "OCBC" },
    { pattern: /\bUOB\b/g, weight: 5, label: "UOB" },
    { pattern: /standard\s+chartered/i, weight: 5, label: "Standard Chartered" },
    { pattern: /opening\s+balance/i, weight: 7, label: "Opening Balance" },
    { pattern: /closing\s+balance/i, weight: 7, label: "Closing Balance" },
    { pattern: /transaction\s+details/i, weight: 4, label: "Transaction Details" },
    { pattern: /beginning\s+balance/i, weight: 6, label: "Beginning Balance" },
    { pattern: /ending\s+balance/i, weight: 6, label: "Ending Balance" },
    { pattern: /withdrawal/i, weight: 5, label: "Withdrawal" },
    { pattern: /balance\s+b\/f/i, weight: 6, label: "Balance B/F" },
    { pattern: /balance\s+c\/f/i, weight: 6, label: "Balance C/F" },
  ],
  cc_statement: [
    { pattern: /credit\s+card/i, weight: 8, label: "Credit Card" },
    { pattern: /TRANSACTION\s+DATE.*DESCRIPTION.*AMOUNT/i, weight: 10, label: "CC Transaction Header" },
    { pattern: /STATEMENT\s+DATE.*PAYMENT\s+DUE\s+DATE/i, weight: 9, label: "CC Statement Header" },
    { pattern: /TOTAL\s+AMOUNT\s+DUE/i, weight: 7, label: "Total Amount Due" },
    { pattern: /TOTAL\s+MINIMUM\s+(DUE|PAYMENT)/i, weight: 7, label: "Minimum Due" },
    { pattern: /TOTAL\s+CREDIT\s+LIMIT/i, weight: 6, label: "Credit Limit" },
    { pattern: /TOTAL\s+AVAILABLE\s+CREDIT/i, weight: 6, label: "Available Credit" },
    { pattern: /LAST\s+MONTH'?S?\s+BALANCE/i, weight: 5, label: "Last Month Balance" },
    { pattern: /PAYMENT\s+BY\s+INTERNET/i, weight: 5, label: "Payment By Internet" },
    { pattern: /CASH\s+REBATE/i, weight: 4, label: "Cash Rebate" },
    { pattern: /SUBTOTAL|SUB-TOTAL/i, weight: 3, label: "Subtotal" },
    { pattern: /citibank/i, weight: 5, label: "Citibank" },
    { pattern: /CITI\s+PREMIERMILES/i, weight: 7, label: "Citi PremierMiles" },
    { pattern: /CITI\s+REWARDS/i, weight: 7, label: "Citi Rewards" },
    { pattern: /FAST\s+INCOMING\s+PAYMENT/i, weight: 5, label: "Fast Incoming Payment" },
    { pattern: /BALANCE\s+PREVIOUS\s+STATEMENT/i, weight: 5, label: "Balance Previous" },
    { pattern: /GRAND\s+TOTAL/i, weight: 4, label: "Grand Total" },
  ],
  tax_noa: [
    { pattern: /notice\s+of\s+assessment/i, weight: 10, label: "Notice of Assessment" },
    { pattern: /\bIRAS\b/g, weight: 8, label: "IRAS" },
    { pattern: /inland\s+revenue/i, weight: 8, label: "Inland Revenue" },
    { pattern: /tax\s+payable/i, weight: 7, label: "Tax Payable" },
    { pattern: /year\s+of\s+assessment/i, weight: 8, label: "Year of Assessment" },
    { pattern: /chargeable\s+income/i, weight: 6, label: "Chargeable Income" },
    { pattern: /tax\s+relief/i, weight: 4, label: "Tax Relief" },
  ],
  loan_letter: [
    { pattern: /housing\s+loan/i, weight: 8, label: "Housing Loan" },
    { pattern: /repayment\s+schedule/i, weight: 7, label: "Repayment Schedule" },
    { pattern: /mortgage/i, weight: 6, label: "Mortgage" },
    { pattern: /disbursement/i, weight: 5, label: "Disbursement" },
    { pattern: /principal\s+outstanding/i, weight: 6, label: "Principal Outstanding" },
    { pattern: /loan\s+tenure/i, weight: 6, label: "Loan Tenure" },
    { pattern: /interest\s+rate/i, weight: 3, label: "Interest Rate" },
    { pattern: /monthly\s+instalment/i, weight: 5, label: "Monthly Instalment" },
    { pattern: /letter\s+of\s+offer/i, weight: 7, label: "Letter of Offer" },
    { pattern: /loan\s+amount/i, weight: 5, label: "Loan Amount" },
    { pattern: /lock.?in\s+period/i, weight: 4, label: "Lock-in Period" },
  ],
  ilp_statement: [
    { pattern: /investment[- ]linked/i, weight: 8, label: "Investment-Linked" },
    { pattern: /fund\s+value/i, weight: 6, label: "Fund Value" },
    { pattern: /unit\s+price/i, weight: 5, label: "Unit Price" },
    { pattern: /net\s+asset\s+value/i, weight: 5, label: "Net Asset Value" },
    { pattern: /fund\s+allocation/i, weight: 5, label: "Fund Allocation" },
    { pattern: /policy\s+value/i, weight: 5, label: "Policy Value" },
    { pattern: /surrender\s+value/i, weight: 4, label: "Surrender Value" },
    { pattern: /units?\s+held/i, weight: 4, label: "Units Held" },
  ],
  investment_statement: [
    { pattern: /\bCDP\b/g, weight: 7, label: "CDP" },
    { pattern: /central\s+depository/i, weight: 8, label: "Central Depository" },
    { pattern: /brokerage/i, weight: 5, label: "Brokerage" },
    { pattern: /portfolio\s+statement/i, weight: 7, label: "Portfolio Statement" },
    { pattern: /securities/i, weight: 3, label: "Securities" },
    { pattern: /dividend/i, weight: 3, label: "Dividend" },
    { pattern: /stock\s+holding/i, weight: 6, label: "Stock Holding" },
    { pattern: /market\s+value/i, weight: 4, label: "Market Value" },
    { pattern: /share\s+balance/i, weight: 5, label: "Share Balance" },
  ],
}

const HIGH_THRESHOLD = 15
const MEDIUM_THRESHOLD = 8

export function classifyDocument(text: string): ClassificationResult {
  const scores: Array<{
    type: DocumentType
    score: number
    matchedKeywords: string[]
  }> = []

  for (const docType of DOCUMENT_TYPES) {
    const rules = RULES[docType]
    let score = 0
    const matched: string[] = []

    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        score += rule.weight
        matched.push(rule.label)
      }
      // Reset lastIndex for global patterns
      rule.pattern.lastIndex = 0
    }

    scores.push({ type: docType, score, matchedKeywords: matched })
  }

  scores.sort((a, b) => b.score - a.score)
  const best = scores[0]

  let confidence: "high" | "medium" | "low"
  if (best.score >= HIGH_THRESHOLD) {
    confidence = "high"
  } else if (best.score >= MEDIUM_THRESHOLD) {
    confidence = "medium"
  } else {
    confidence = "low"
  }

  return {
    type: best.type,
    confidence,
    matchedKeywords: best.matchedKeywords,
  }
}
