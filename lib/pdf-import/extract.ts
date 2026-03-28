import type { DocumentType, ExtractionResult } from "@/lib/pdf-import/types"
import { extractCpf } from "@/lib/pdf-import/extractors/cpf"
import { extractInsurance } from "@/lib/pdf-import/extractors/insurance"
import { extractBankStatement } from "@/lib/pdf-import/extractors/bank-statement"
import { extractTax } from "@/lib/pdf-import/extractors/tax"
import { extractLoan } from "@/lib/pdf-import/extractors/loan"
import { extractIlp } from "@/lib/pdf-import/extractors/ilp"
import { extractInvestment } from "@/lib/pdf-import/extractors/investment"

/**
 * Run the appropriate extractor for a given document type.
 */
export function extractDocument(
  text: string,
  docType: DocumentType,
): ExtractionResult {
  switch (docType) {
    case "cpf_statement":
      return extractCpf(text)
    case "insurance_policy":
      return extractInsurance(text)
    case "bank_statement":
      return extractBankStatement(text)
    case "tax_noa":
      return extractTax(text)
    case "loan_letter":
      return extractLoan(text)
    case "ilp_statement":
      return extractIlp(text)
    case "investment_statement":
      return extractInvestment(text)
  }
}
