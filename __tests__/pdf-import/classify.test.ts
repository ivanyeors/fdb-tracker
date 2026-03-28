import { describe, it, expect } from "vitest"
import { classifyDocument } from "@/lib/pdf-import/classify"

describe("classifyDocument", () => {
  it("classifies CPF statement with high confidence", () => {
    const text = `
      Central Provident Fund Board
      CPF Statement of Account
      as at 31 December 2025
      Ordinary Account: $50,000.00
      Special Account: $30,000.00
      MediSave Account: $20,000.00
    `
    const result = classifyDocument(text)
    expect(result.type).toBe("cpf_statement")
    expect(result.confidence).toBe("high")
    expect(result.matchedKeywords).toContain("Central Provident Fund")
  })

  it("classifies insurance policy", () => {
    const text = `
      AIA Singapore Private Limited
      Renewal Certificate
      Policy No. L123456789
      Personal Accident Insurance
      Sum Assured: $500,000
      Premium: $120.00 per annum
      Life Assured: John Doe
    `
    const result = classifyDocument(text)
    expect(result.type).toBe("insurance_policy")
    expect(result.confidence).toBe("high")
    expect(result.matchedKeywords).toContain("AIA")
    expect(result.matchedKeywords).toContain("Renewal Certificate")
  })

  it("classifies bank statement", () => {
    const text = `
      DBS Bank Ltd
      Statement of Account
      Statement Period: 1 Jan 2026 to 31 Jan 2026
      Opening Balance: $10,000.00
      Closing Balance: $12,500.00
    `
    const result = classifyDocument(text)
    expect(result.type).toBe("bank_statement")
    expect(result.confidence).toBe("high")
  })

  it("classifies IRAS tax notice", () => {
    const text = `
      Inland Revenue Authority of Singapore
      IRAS
      Notice of Assessment
      Year of Assessment 2025
      Tax Payable: $3,456.00
      Chargeable Income: $80,000.00
    `
    const result = classifyDocument(text)
    expect(result.type).toBe("tax_noa")
    expect(result.confidence).toBe("high")
  })

  it("classifies loan letter", () => {
    const text = `
      DBS Bank Ltd
      Letter of Offer
      Housing Loan
      Loan Amount: $500,000
      Interest Rate: 2.60% per annum
      Loan Tenure: 300 months
      Monthly Instalment: $2,234.00
    `
    const result = classifyDocument(text)
    expect(result.type).toBe("loan_letter")
    expect(result.confidence).toBe("high")
  })

  it("classifies ILP statement", () => {
    const text = `
      Investment-Linked Policy Statement
      Policy Value as at 31 Dec 2025
      Fund Value: $25,000.00
      Unit Price: $1.234
      Total Premiums Paid: $20,000.00
    `
    const result = classifyDocument(text)
    expect(result.type).toBe("ilp_statement")
    expect(result.confidence).toBe("high")
  })

  it("classifies investment statement", () => {
    const text = `
      The Central Depository (Pte) Limited
      CDP Securities Account
      Portfolio Statement as at 31 Dec 2025
      Share Balance
      Securities held in custody
    `
    const result = classifyDocument(text)
    expect(result.type).toBe("investment_statement")
    expect(result.confidence).toBe("high")
  })

  it("returns low confidence for ambiguous text", () => {
    const text = "Hello world this is a random document with no financial keywords"
    const result = classifyDocument(text)
    expect(result.confidence).toBe("low")
  })
})
