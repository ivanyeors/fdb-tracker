import { describe, it, expect } from "vitest"
import { extractCpf } from "@/lib/pdf-import/extractors/cpf"
import { extractInsurance } from "@/lib/pdf-import/extractors/insurance"
import { extractBankStatement } from "@/lib/pdf-import/extractors/bank-statement"
import { extractTax } from "@/lib/pdf-import/extractors/tax"
import { extractLoan } from "@/lib/pdf-import/extractors/loan"
import { extractIlp } from "@/lib/pdf-import/extractors/ilp"
import { extractInvestment } from "@/lib/pdf-import/extractors/investment"

describe("extractCpf", () => {
  it("extracts CPF balances from typical statement text", () => {
    const text = `
      CPF Statement of Account
      as at 31 December 2025

      Ordinary Account
      Balance: $50,123.45

      Special Account
      Balance: $30,456.78

      MediSave Account
      Balance: $20,789.01
    `
    const result = extractCpf(text)
    expect(result.docType).toBe("cpf_statement")
    expect(result.month).toBe("2025-12-01")
    expect(result.oa).toBe(50123.45)
    expect(result.sa).toBe(30456.78)
    expect(result.ma).toBe(20789.01)
  })

  it("reports warnings for missing fields", () => {
    const result = extractCpf("Some random text with no CPF data")
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.oa).toBeNull()
    expect(result.sa).toBeNull()
    expect(result.ma).toBeNull()
  })
})

describe("extractInsurance", () => {
  it("extracts AIA personal accident policy details", () => {
    const text = `
      AIA Singapore Private Limited
      Renewal Certificate
      Policy No. L987654321
      AIA Solitaire Personal Accident
      Personal Accident Insurance
      Sum Assured: $500,000
      Annual Premium: $156.00
      Effective Date: 01/06/2025
      Expiry Date: 01/06/2026
      Life Assured: Ivan Doe
    `
    const result = extractInsurance(text)
    expect(result.docType).toBe("insurance_policy")
    expect(result.insurer).toBe("AIA")
    expect(result.policyNumber).toBe("L987654321")
    expect(result.type).toBe("personal_accident")
    expect(result.premiumAmount).toBe(156)
    expect(result.frequency).toBe("yearly")
    expect(result.coverageAmount).toBe(500000)
  })

  it("extracts AIA renewal certificate with S$ amounts and Mon DD, YYYY dates", () => {
    const text = `
      AIA Singapore
      1 Robinson Road, AIA Tower
      Singapore 048542

      RENEWAL CERTIFICATE

      Policy No. : P561125547

      Name of Insured : Yeo Rong Suan
      Plan : AIA SOLITAIRE PERSONAL
      ACCIDENT
      Renewal Date : Dec 27, 2025
      Sum Assured : S$100,000.00 Payment Mode : Annual
      Premium Payable
      (with GST)
      : S$247.08

      ACCIDENTAL DEATH BENEFIT
      Dependant Name Coverage start date Coverage Renewal Bonus Premium Coverage expiry date
      YEO RONG SUAN Dec 27, 2018 S$100,000.00 S$15,000.00 S$20.37 Dec 27, 2068
    `
    const result = extractInsurance(text)
    expect(result.insurer).toBe("AIA")
    expect(result.policyNumber).toBe("P561125547")
    expect(result.name).toBe("AIA SOLITAIRE PERSONAL ACCIDENT")
    expect(result.type).toBe("personal_accident")
    expect(result.premiumAmount).toBe(247.08)
    expect(result.frequency).toBe("yearly")
    expect(result.coverageAmount).toBe(100000)
    expect(result.inceptionDate).toBe("2025-12-27")
    expect(result.endDate).toBe("2068-12-27")
    expect(result.warnings).toHaveLength(0)
  })

  it("detects Prudential insurer", () => {
    const text = "Prudential Assurance Company Singapore\nPolicy Schedule\nPremium: $200.00"
    const result = extractInsurance(text)
    expect(result.insurer).toBe("Prudential")
  })

  it("detects critical illness type", () => {
    const text = "AIA Policy\nCritical Illness Coverage\nSum Assured: $100,000"
    const result = extractInsurance(text)
    expect(result.type).toBe("critical_illness")
  })
})

describe("extractBankStatement", () => {
  it("extracts DBS bank statement details", () => {
    const text = `
      DBS Bank Ltd
      Statement of Account
      Statement for January 2026
      Opening Balance: $10,000.00
      Closing Balance: $12,500.00
    `
    const result = extractBankStatement(text)
    expect(result.bankName).toBe("DBS")
    expect(result.month).toBe("2026-01-01")
    expect(result.openingBalance).toBe(10000)
    expect(result.closingBalance).toBe(12500)
  })

  it("detects OCBC bank", () => {
    const text = "OCBC Bank\nAccount Summary\nBalance Brought Forward $5,000.00"
    const result = extractBankStatement(text)
    expect(result.bankName).toBe("OCBC")
  })
})

describe("extractTax", () => {
  it("extracts IRAS NOA details", () => {
    const text = `
      Inland Revenue Authority of Singapore
      Notice of Assessment
      Year of Assessment 2025
      Chargeable Income: $80,000.00
      Net Tax Payable: $3,456.78
    `
    const result = extractTax(text)
    expect(result.year).toBe(2025)
    expect(result.taxPayable).toBe(3456.78)
  })

  it("extracts YA shorthand", () => {
    const text = "IRAS\nYA 2024\nTax Payable: $1,234.56"
    const result = extractTax(text)
    expect(result.year).toBe(2024)
    expect(result.taxPayable).toBe(1234.56)
  })
})

describe("extractLoan", () => {
  it("extracts housing loan details", () => {
    const text = `
      DBS Bank Ltd
      Letter of Offer
      Housing Loan
      Loan Amount: $500,000.00
      Interest Rate: 2.60% per annum
      Tenure: 25 years
      Disbursement Date: 15/03/2024
    `
    const result = extractLoan(text)
    expect(result.lender).toBe("DBS")
    expect(result.type).toBe("housing")
    expect(result.principal).toBe(500000)
    expect(result.ratePct).toBe(2.6)
    expect(result.tenureMonths).toBe(300)
    expect(result.startDate).toBe("2024-03-15")
  })
})

describe("extractIlp", () => {
  it("extracts ILP statement details", () => {
    const text = `
      Investment-Linked Policy Statement
      Policy Name: AIA Pro Achiever 3.0
      Statement for December 2025
      Total Fund Value: $25,000.00
      Total Premiums Paid: $20,000.00
    `
    const result = extractIlp(text)
    expect(result.productName).toBe("AIA Pro Achiever 3.0")
    expect(result.month).toBe("2025-12-01")
    expect(result.fundValue).toBe(25000)
    expect(result.premiumsPaid).toBe(20000)
  })
})

describe("extractInvestment", () => {
  it("extracts portfolio total value", () => {
    const text = `
      CDP Portfolio Statement as at December 2025
      Total Portfolio Value: $150,000.00
    `
    const result = extractInvestment(text)
    expect(result.month).toBe("2025-12-01")
    expect(result.totalValue).toBe(150000)
  })

  it("reports warning when no holdings found", () => {
    const text = "Some investment document with no clear holdings table"
    const result = extractInvestment(text)
    expect(result.holdings).toHaveLength(0)
    expect(result.warnings.some((w) => w.field === "holdings")).toBe(true)
  })
})
