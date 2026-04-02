export const DOCUMENT_TYPES = [
  "cpf_statement",
  "insurance_policy",
  "bank_statement",
  "cc_statement",
  "tax_noa",
  "loan_letter",
  "ilp_statement",
  "investment_statement",
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cpf_statement: "CPF Statement",
  insurance_policy: "Insurance Policy",
  bank_statement: "Bank Statement",
  cc_statement: "Credit Card Statement",
  tax_noa: "Tax Notice of Assessment",
  loan_letter: "Loan Letter",
  ilp_statement: "ILP Statement",
  investment_statement: "Investment Statement",
}

export interface ClassificationResult {
  type: DocumentType
  confidence: "high" | "medium" | "low"
  matchedKeywords: string[]
}

export interface ExtractionWarning {
  field: string
  message: string
}

export interface BaseExtractionResult {
  docType: DocumentType
  warnings: ExtractionWarning[]
}

export interface CpfExtractionResult extends BaseExtractionResult {
  docType: "cpf_statement"
  month: string | null
  oa: number | null
  sa: number | null
  ma: number | null
}

export interface InsuranceBenefitEntry {
  benefitName: string
  coverageType: string | null
  coverageAmount: number
  benefitPremium: number | null
  renewalBonus: number | null
  benefitExpiryDate: string | null
}

export interface InsuranceExtractionResult extends BaseExtractionResult {
  docType: "insurance_policy"
  insurer: string | null
  policyNumber: string | null
  name: string | null
  type: string | null
  premiumAmount: number | null
  frequency: string | null
  coverageAmount: number | null
  coverageType: string | null
  inceptionDate: string | null
  endDate: string | null
  riderName: string | null
  riderPremium: number | null
  benefits: InsuranceBenefitEntry[]
  cpfPremium: number | null
  premiumWaiver: boolean
  coverageTillAge: number | null
  subType: string | null
  cashValue: number | null
  maturityValue: number | null
}

export interface BankTransaction {
  date: string
  valueDate?: string
  description: string
  amount: number
  balance: number | null
  txnType: "debit" | "credit"
  categoryName: string
  foreignCurrency?: string
  excludeFromSpending: boolean
  rawText: string
}

export interface BankStatementExtractionResult extends BaseExtractionResult {
  docType: "bank_statement"
  bankName: string | null
  month: string | null
  openingBalance: number | null
  closingBalance: number | null
  accountNumber: string | null
  transactions: BankTransaction[]
  totalDebit: number | null
  totalCredit: number | null
}

export interface CcStatementExtractionResult extends BaseExtractionResult {
  docType: "cc_statement"
  bankName: string | null
  month: string | null
  cardNumber: string | null
  statementDate: string | null
  paymentDueDate: string | null
  totalAmountDue: number | null
  minimumPayment: number | null
  transactions: BankTransaction[]
  totalDebit: number | null
  totalCredit: number | null
}

export interface TaxExtractionResult extends BaseExtractionResult {
  docType: "tax_noa"
  year: number | null
  taxPayable: number | null
}

export interface LoanExtractionResult extends BaseExtractionResult {
  docType: "loan_letter"
  lender: string | null
  name: string | null
  type: string | null
  principal: number | null
  ratePct: number | null
  tenureMonths: number | null
  startDate: string | null
  propertyType: string | null
}

export interface IlpExtractionResult extends BaseExtractionResult {
  docType: "ilp_statement"
  productName: string | null
  month: string | null
  fundValue: number | null
  premiumsPaid: number | null
}

export interface InvestmentExtractionResult extends BaseExtractionResult {
  docType: "investment_statement"
  holdings: Array<{
    symbol: string
    name: string
    units: number
    costBasis: number | null
  }>
  totalValue: number | null
  month: string | null
}

export type ExtractionResult =
  | CpfExtractionResult
  | InsuranceExtractionResult
  | BankStatementExtractionResult
  | CcStatementExtractionResult
  | TaxExtractionResult
  | LoanExtractionResult
  | IlpExtractionResult
  | InvestmentExtractionResult
