import { describe, it, expect } from "vitest"
import {
  parseOcbcBankStatement,
  parseOcbcCcStatement,
  categorizeTransaction,
  detectOcbcLayout,
  type CategoryRule,
} from "@/lib/pdf-import/parsers/ocbc-transaction-parser"

describe("detectOcbcLayout", () => {
  it("detects bank statement layout", () => {
    const text = "Transaction Date Description Withdrawal Deposit Balance"
    expect(detectOcbcLayout(text)).toBe("bank")
  })

  it("detects CC layout", () => {
    const text = "TRANSACTION DATE DESCRIPTION AMOUNT (SGD)"
    expect(detectOcbcLayout(text)).toBe("cc")
  })

  it("returns null for unknown", () => {
    expect(detectOcbcLayout("random text")).toBe(null)
  })
})

describe("parseOcbcBankStatement", () => {
  const samplePage1 = [
    "OCBC Bank",
    "65 Chulia Street, OCBC Centre",
    "Singapore 049513",
    "STATEMENT OF ACCOUNT",
    "Page 1 of 2",
    "Transaction",
    "Date Date Description Cheque Withdrawal Deposit Balance",
    "Value",
    "360 ACCOUNT",
    "Account No. 595427493001",
    "1 JAN 2026 TO 31 JAN 2026",
    "59,215.39BALANCE B/F",
    "06 JAN 3,635.15 62,850.5406 JAN IBG GIRO",
    "SALA",
    "ALLEGIS GROUP SINGA",
    "SALARY",
    "07 JAN 16.60 62,833.9407 JAN DEBIT PURCHASE",
    "05/01/26",
    "xx-9315 Grab*",
    "A-8QOFKNAWWEV6AV",
    "S",
    "12 JAN 60.17 61,830.2312 JAN BONUS INTEREST",
    "360 SALARY BONUS",
  ].join("\n")

  const samplePage2 = [
    "OCBC Bank",
    "STATEMENT OF ACCOUNT",
    "Page 2 of 2",
    "Transaction",
    "Date Date Description Cheque Withdrawal Deposit Balance",
    "Value",
    "360 ACCOUNT",
    "Account No. 595427493001",
    "1 JAN 2026 TO 31 JAN 2026",
    "01 FEB 2.59 60,853.7031 JAN INTEREST CREDIT",
    "60,853.70BALANCE C/F",
    "Total Withdrawals/Deposits",
    "3,726.912,088.60",
    "CHECK YOUR STATEMENT",
  ].join("\n")

  it("extracts metadata", () => {
    const result = parseOcbcBankStatement([samplePage1, samplePage2])
    expect(result.layout).toBe("bank")
    expect(result.accountNumber).toBe("595427493001")
    expect(result.statementMonth).toBe("2026-01-01")
    expect(result.openingBalance).toBe(59215.39)
    expect(result.closingBalance).toBe(60853.70)
  })

  it("parses transactions", () => {
    const result = parseOcbcBankStatement([samplePage1, samplePage2])
    expect(result.transactions.length).toBeGreaterThanOrEqual(3)

    // First transaction: IBG GIRO deposit
    const salary = result.transactions.find((t) =>
      t.description.includes("IBG GIRO"),
    )
    expect(salary).toBeDefined()
    expect(salary!.amount).toBeGreaterThan(0)
    expect(salary!.txnType).toBe("credit")
    expect(salary!.description).toContain("ALLEGIS GROUP")
  })

  it("detects CC payment as exclude_from_spending", () => {
    const pageWithCcPayment = [
      "OCBC Bank",
      "STATEMENT OF ACCOUNT",
      "Transaction",
      "Date Date Description Cheque Withdrawal Deposit Balance",
      "Value",
      "360 ACCOUNT",
      "Account No. 595427493001",
      "1 JAN 2026 TO 31 JAN 2026",
      "59,215.39BALANCE B/F",
      "08 JAN 53.25 61,813.1808 JAN BILL PAYMENT INB",
      "4524192011153248",
      "INTERNET BANKING",
      "SINGAPORE",
      "60,853.70BALANCE C/F",
    ].join("\n")

    const result = parseOcbcBankStatement([pageWithCcPayment])
    const ccPayment = result.transactions.find((t) =>
      t.description.includes("BILL PAYMENT"),
    )
    expect(ccPayment).toBeDefined()
    expect(ccPayment!.excludeFromSpending).toBe(true)
  })
})

describe("parseOcbcCcStatement", () => {
  const samplePage = [
    "OCBC Bank",
    "STATEMENT DATE PAYMENT DUE DATE TOTAL CREDIT LIMIT TOTAL AVAILABLE CREDIT LIMIT TOTAL MINIMUM DUE",
    "01-02-2026 24-02-2026 S$2,000 S$1,529.89 S$50.00",
    "TRANSACTION DATE DESCRIPTION AMOUNT (SGD)",
    "OCBC 365 CREDIT CARD",
    "YEO RONG SUAN 4524-1920-1115-3248",
    "53.25LAST MONTH'S BALANCE",
    "08/01 (53.25PAYMENT BY INTERNET )",
    "10/01 0.70-0149 FP XTRA VIVO SINGAPORE SG",
    "10/01 15.20-0149 TAKASHIMAYA (S) LTD SINGAPORE SG",
    "13/01 29.20-5563 CURSOR, AI POWERED",
    "FOREIGN CURRENCY USD 21.95",
    "CURSOR.COM US",
    "28/01 (0.07CASH REBATE )",
    "470.11SUBTOTAL",
    "470.11TOTAL",
    "TOTAL AMOUNT DUE 470.11",
  ].join("\n")

  it("extracts CC metadata", () => {
    const result = parseOcbcCcStatement([samplePage])
    expect(result.layout).toBe("cc")
    expect(result.cardNumber).toBe("4524-1920-1115-3248")
    expect(result.statementMonth).toBe("2026-02-01")
    expect(result.totalAmountDue).toBe(470.11)
    expect(result.minimumPayment).toBe(50.00)
  })

  it("parses CC transactions", () => {
    const result = parseOcbcCcStatement([samplePage])
    expect(result.transactions.length).toBeGreaterThanOrEqual(4)

    // Payment should be credit
    const payment = result.transactions.find((t) =>
      t.description.includes("PAYMENT BY INTERNET"),
    )
    expect(payment).toBeDefined()
    expect(payment!.txnType).toBe("credit")
    expect(payment!.amount).toBe(53.25)
    expect(payment!.excludeFromSpending).toBe(true)

    // Purchase should be debit
    const purchase = result.transactions.find((t) =>
      t.description.includes("TAKASHIMAYA"),
    )
    expect(purchase).toBeDefined()
    expect(purchase!.txnType).toBe("debit")
    expect(purchase!.amount).toBe(-15.20)
  })

  it("captures foreign currency metadata", () => {
    const result = parseOcbcCcStatement([samplePage])
    const cursor = result.transactions.find((t) =>
      t.description.includes("CURSOR"),
    )
    expect(cursor).toBeDefined()
    expect(cursor!.foreignCurrency).toBe("USD 21.95")
    expect(cursor!.amount).toBe(-29.20) // SGD amount, not USD
  })

  it("skips LAST MONTH'S BALANCE", () => {
    const result = parseOcbcCcStatement([samplePage])
    const lastMonth = result.transactions.find((t) =>
      t.description.includes("LAST MONTH"),
    )
    expect(lastMonth).toBeUndefined()
  })
})

describe("categorizeTransaction", () => {
  const rules: CategoryRule[] = [
    { pattern: "NTUC", categoryName: "Food & Dining", priority: 0 },
    { pattern: "GRAB FOOD", categoryName: "Food & Dining", priority: 0 },
    { pattern: "GOJEK", categoryName: "Transport", priority: 0 },
    { pattern: "BUS/MRT", categoryName: "Transport", priority: 0 },
    { pattern: "CURSOR", categoryName: "Software & Subscriptions", priority: 0 },
    { pattern: "DONER KEBAB", categoryName: "Food & Dining", priority: 10 },
  ]

  it("matches keywords", () => {
    expect(categorizeTransaction("NTUC FAIRPRICE", rules)).toBe("Food & Dining")
    expect(categorizeTransaction("Gopay-Gojek", rules)).toBe("Transport")
    expect(categorizeTransaction("CURSOR, AI POWERED IDE", rules)).toBe("Software & Subscriptions")
  })

  it("returns Others for no match", () => {
    expect(categorizeTransaction("RANDOM MERCHANT", rules)).toBe("Others")
  })

  it("prioritizes user rules", () => {
    expect(categorizeTransaction("DONER KEBAB TURK", rules)).toBe("Food & Dining")
  })

  it("disambiguates Grab — food vs transport", () => {
    expect(categorizeTransaction("Grab* GRAB FOOD delivery", rules)).toBe("Food & Dining")
    expect(categorizeTransaction("Grab* A-8QOFKNAWWEV6AV", rules)).toBe("Transport")
  })
})
