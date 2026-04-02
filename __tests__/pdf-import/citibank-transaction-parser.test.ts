import { describe, it, expect } from "vitest"
import { parseCitibankCcStatement } from "@/lib/pdf-import/parsers/citibank-transaction-parser"

describe("parseCitibankCcStatement", () => {
  const samplePage1 = [
    "Citibank",
    "Statement of Account",
    "YOUR BILL SUMMARY",
    "Statement Date January 05, 2026",
    "Credit Limit $30,100.00",
    "Current Balance $967.51",
    "Total Minimum Payment $50.00",
    "Payment Due Date January 30, 2026",
  ].join("\n")

  const samplePage2 = [
    "CITI PREMIERMILES WORLD MASTER 5425 5033 0242 2489 Payment Due Date: January 30, 2026",
    "7,292.44 7,292.44 967.32 0.00 0.19 967.51",
    "DATE DESCRIPTION AMOUNT (SGD)",
    "TRANSACTIONS FOR CITI PREMIERMILES WORLD MASTER CARD",
    "ALL TRANSACTIONS BILLED IN SINGAPORE DOLLARS",
    "BALANCE PREVIOUS STATEMENT 7,292.44",
    "08 DEC FAST INCOMING PAYMENT (4,292.44)",
    "08 DEC FAST INCOMING PAYMENT (3,000.00)",
    "SUB-TOTAL: 0.00",
    "CITI PREMIERMILES WORLD MASTER 5425 5033 0242 2489 - RONG SUAN YEO",
    "07 DEC TAOBAO 125 LONDON WAGB 9.14",
    "XXXX-XXXX-XXXX-3818",
    "07 DEC BUS/MRT 759644555 SINGAPORE SG 15.05",
    "XXXX-XXXX-XXXX-8711",
    "09 DEC CCY CONVERSION FEE SGD 9.14 0.09",
    "10 DEC Hvala Odeon Singapore SG 47.84",
    "XXXX-XXXX-XXXX-3818",
  ].join("\n")

  const samplePage3 = [
    "CITI PREMIERMILES WORLD MASTER 5425 5033 0242 2489 Payment Due Date: January 30, 2026",
    "Page 3 of 8",
    "DATE DESCRIPTION AMOUNT (SGD)",
    "12 DEC MYREPUBLIC BROADBAND P SINGAPORE SG 47.99",
    "31 DEC DON DON DONKI SINGAPORE SG 2.50",
    "XXXX-XXXX-XXXX-3818",
    "01 JAN taobao.com TAOBAO London GB 5.86",
    "XXXX-XXXX-XXXX-3818",
    "03 JAN CCY CONVERSION FEE SGD 5.86 0.05",
    "SUB-TOTAL: 967.51",
    "GRAND TOTAL 967.51",
  ].join("\n")

  it("extracts metadata", () => {
    const result = parseCitibankCcStatement([samplePage1, samplePage2, samplePage3])
    expect(result.layout).toBe("cc")
    expect(result.cardNumber).toBe("5425-5033-0242-2489")
    expect(result.statementMonth).toBe("2026-01-01")
    expect(result.totalAmountDue).toBe(967.51)
    expect(result.minimumPayment).toBe(50.00)
    expect(result.cardName).toBe("Citi PremierMiles")
  })

  it("parses transactions", () => {
    const result = parseCitibankCcStatement([samplePage1, samplePage2, samplePage3])
    expect(result.transactions.length).toBeGreaterThanOrEqual(5)

    // FAST INCOMING PAYMENT should be credit + excluded
    const payment = result.transactions.find((t) =>
      t.description.includes("FAST INCOMING PAYMENT"),
    )
    expect(payment).toBeDefined()
    expect(payment!.txnType).toBe("credit")
    expect(payment!.excludeFromSpending).toBe(true)

    // Purchase
    const taobao = result.transactions.find((t) =>
      t.description.includes("TAOBAO"),
    )
    expect(taobao).toBeDefined()
    expect(taobao!.txnType).toBe("debit")
    expect(taobao!.amount).toBe(-9.14)
  })

  it("parses CCY CONVERSION FEE", () => {
    const result = parseCitibankCcStatement([samplePage1, samplePage2, samplePage3])
    const ccyFee = result.transactions.find((t) =>
      t.description.includes("CCY CONVERSION FEE"),
    )
    expect(ccyFee).toBeDefined()
    expect(ccyFee!.amount).toBe(-0.09)
  })

  it("skips BALANCE PREVIOUS STATEMENT", () => {
    const result = parseCitibankCcStatement([samplePage1, samplePage2, samplePage3])
    const balance = result.transactions.find((t) =>
      t.description.includes("BALANCE PREVIOUS"),
    )
    expect(balance).toBeUndefined()
  })

  it("resolves year-boundary dates correctly", () => {
    const result = parseCitibankCcStatement([samplePage1, samplePage2, samplePage3])
    // Statement is January 2026, so Dec transactions should be 2025
    const decTxn = result.transactions.find((t) =>
      t.description.includes("Hvala"),
    )
    expect(decTxn).toBeDefined()
    expect(decTxn!.date).toMatch(/^2025-12-/)

    // Jan transactions should be 2026
    const janTxn = result.transactions.find((t) =>
      t.description.includes("taobao.com"),
    )
    expect(janTxn).toBeDefined()
    expect(janTxn!.date).toMatch(/^2026-01-/)
  })

  it("parses balance breakdown", () => {
    const result = parseCitibankCcStatement([samplePage1, samplePage2, samplePage3])
    expect(result.previousBalance).toBe(7292.44)
    expect(result.paymentsCredits).toBe(7292.44)
    expect(result.purchasesAdvances).toBe(967.32)
    expect(result.feesCharges).toBe(0.19)
  })
})
