import { describe, expect, it } from "vitest"
import {
  computeOcbc360CategoryRows,
  ocbc360RowsToConfig,
  OCBC_CARD_SPEND_MIN,
  OCBC_SAVE_INCREASE_MIN,
  OCBC_SALARY_CREDIT_MIN,
} from "@/lib/calculations/ocbc360-status"
import {
  getOcbc360EffectiveRate,
  OCBC_BONUS_INTEREST_BALANCE_CAP,
  OCBC_GROW_BALANCE_THRESHOLD,
} from "@/lib/calculations/bank-interest"

const baseInputs = {
  balance: 10_000,
  snapshotsClosing: [10_500, 10_000] as [number, number],
  insureMet: false,
  investMet: false,
}

describe("computeOcbc360CategoryRows", () => {
  it("marks salary met from income when no cashflow row", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: null,
      monthlyDiscretionaryOutflow: OCBC_CARD_SPEND_MIN,
      monthlyGrossSalaryFromIncome: OCBC_SALARY_CREDIT_MIN,
    })
    expect(rows.find((r) => r.id === "salary")?.met).toBe(true)
    expect(rows.find((r) => r.id === "salary")?.progressLabel).toContain(
      "income settings",
    )
  })

  it("cashflow inflow overrides income for salary", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: 500,
      monthlyDiscretionaryOutflow: 0,
      monthlyGrossSalaryFromIncome: 10_000,
    })
    const s = rows.find((r) => r.id === "salary")
    expect(s?.met).toBe(false)
    expect(s?.progressLabel).toContain("monthly inflow")
  })

  it("marks salary not met below threshold from income", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: null,
      monthlyDiscretionaryOutflow: OCBC_CARD_SPEND_MIN,
      monthlyGrossSalaryFromIncome: OCBC_SALARY_CREDIT_MIN - 1,
    })
    expect(rows.find((r) => r.id === "salary")?.met).toBe(false)
  })

  it("salary shows no data when no cashflow and no income", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: null,
      monthlyDiscretionaryOutflow: 0,
      monthlyGrossSalaryFromIncome: null,
    })
    const s = rows.find((r) => r.id === "salary")
    expect(s?.met).toBe(false)
    expect(s?.progressLabel).toContain("No monthly inflow")
  })

  it("spend missing when no outflow row", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: null,
      monthlyGrossSalaryFromIncome: 2000,
    })
    const sp = rows.find((r) => r.id === "spend")
    expect(sp?.met).toBe(false)
    expect(sp?.progressLabel).toContain("No monthly outflow")
  })

  it("spend met from logged outflow", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: 600,
      monthlyGrossSalaryFromIncome: 2000,
    })
    expect(rows.find((r) => r.id === "spend")?.met).toBe(true)
  })

  it("no profile blocks salary and spend cashflow messaging", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: false,
      monthlyCashflowInflow: null,
      monthlyDiscretionaryOutflow: null,
      monthlyGrossSalaryFromIncome: null,
    })
    expect(rows.find((r) => r.id === "salary")?.progressLabel).toContain(
      "No profile linked",
    )
    expect(rows.find((r) => r.id === "spend")?.progressLabel).toContain(
      "No profile linked",
    )
  })

  it("save met when delta meets minimum", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: 0,
      monthlyGrossSalaryFromIncome: 2000,
      snapshotsClosing: [10_000 + OCBC_SAVE_INCREASE_MIN, 10_000],
    })
    expect(rows.find((r) => r.id === "save")?.met).toBe(true)
  })

  it("save not met without two snapshots", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: 500,
      monthlyGrossSalaryFromIncome: 2000,
      snapshotsClosing: null,
    })
    expect(rows.find((r) => r.id === "save")?.met).toBe(false)
  })

  it("grow met at threshold balance", () => {
    const rows = computeOcbc360CategoryRows({
      balance: OCBC_GROW_BALANCE_THRESHOLD,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: 500,
      monthlyGrossSalaryFromIncome: 2000,
      snapshotsClosing: [10_500, 10_000],
      insureMet: false,
      investMet: false,
    })
    expect(rows.find((r) => r.id === "grow")?.met).toBe(true)
  })

  it("bonus tranches row tracks balance toward S$100k cap", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      balance: 50_000,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: 500,
      monthlyGrossSalaryFromIncome: 2000,
      snapshotsClosing: [10_500, 10_000],
      insureMet: false,
      investMet: false,
    })
    const b = rows.find((r) => r.id === "bonus_tranches")
    expect(b?.met).toBe(false)
    expect(b?.progress).toEqual({ current: 50_000, target: OCBC_BONUS_INTEREST_BALANCE_CAP })
    const stacked = getOcbc360EffectiveRate(ocbc360RowsToConfig(rows))
    expect(b?.rateLabel).toBe(
      `${(stacked.first75kRate * 100).toFixed(2)}% / ${(stacked.next25kRate * 100).toFixed(2)}%`,
    )
  })

  it("bonus tranches met when balance reaches two-tranche cap", () => {
    const rows = computeOcbc360CategoryRows({
      ...baseInputs,
      balance: OCBC_BONUS_INTEREST_BALANCE_CAP,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: 500,
      monthlyGrossSalaryFromIncome: 2000,
      snapshotsClosing: [10_500, 10_000],
      insureMet: false,
      investMet: false,
    })
    expect(rows.find((r) => r.id === "bonus_tranches")?.met).toBe(true)
  })

  it("maps rows to Ocbc360Config", () => {
    const rows = computeOcbc360CategoryRows({
      balance: OCBC_GROW_BALANCE_THRESHOLD,
      profileLinked: true,
      monthlyCashflowInflow: 2000,
      monthlyDiscretionaryOutflow: 600,
      monthlyGrossSalaryFromIncome: 2000,
      snapshotsClosing: [11_000, 10_000],
      insureMet: true,
      investMet: false,
    })
    const cfg = ocbc360RowsToConfig(rows)
    expect(cfg.salaryMet).toBe(true)
    expect(cfg.saveMet).toBe(true)
    expect(cfg.spendMet).toBe(true)
    expect(cfg.insureMet).toBe(true)
    expect(cfg.investMet).toBe(false)
    expect(cfg.growMet).toBe(true)
  })
})
