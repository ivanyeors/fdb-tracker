import type { DocumentType, ExtractionResult } from "@/lib/pdf-import/types"
import { extractCpf } from "@/lib/pdf-import/extractors/cpf"
import { extractInsurance } from "@/lib/pdf-import/extractors/insurance"
import { extractBankStatement } from "@/lib/pdf-import/extractors/bank-statement"
import { extractCcStatement } from "@/lib/pdf-import/extractors/cc-statement"
import { extractTax } from "@/lib/pdf-import/extractors/tax"
import { extractLoan } from "@/lib/pdf-import/extractors/loan"
import { extractIlp } from "@/lib/pdf-import/extractors/ilp"
import { extractInvestment } from "@/lib/pdf-import/extractors/investment"

/**
 * Run the appropriate extractor for a given document type.
 * @param text - merged text (single string, no line breaks between pages)
 * @param docType - classified document type
 * @param pages - optional per-page text array (with line breaks preserved)
 */
export function extractDocument(
  text: string,
  docType: DocumentType,
  pages?: string[],
): ExtractionResult {
  switch (docType) {
    case "cpf_statement":
      return extractCpf(text)
    case "insurance_policy":
      return extractInsurance(text)
    case "bank_statement":
      return extractBankStatement(text, pages)
    case "cc_statement":
      return extractCcStatement(text, pages)
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
