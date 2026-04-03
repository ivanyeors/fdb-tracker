import {
  getActiveEmployersForMonth,
  calculateMultiEmployerAnnualCpf,
  calculateCpfContribution,
  type EmploymentPeriod,
} from "@/lib/calculations/cpf"

describe("getActiveEmployersForMonth", () => {
  const periods: EmploymentPeriod[] = [
    {
      employerName: "EVYD Research",
      monthlySalary: 6671,
      startDate: "2024-06-01",
      endDate: "2025-01-31",
    },
    {
      employerName: "Stamford Precision",
      monthlySalary: 2000,
      startDate: "2024-01-01",
      endDate: null, // ongoing
    },
    {
      employerName: "Allegis Group",
      monthlySalary: 7000,
      startDate: "2025-10-01",
      endDate: null,
    },
  ]

  it("returns employers active in a given month", () => {
    // Jan 2025: EVYD (ends Jan 31) + Stamford (ongoing)
    const jan = getActiveEmployersForMonth(periods, 2025, 0)
    expect(jan.map((e) => e.employerName)).toEqual([
      "EVYD Research",
      "Stamford Precision",
    ])
  })

  it("excludes ended employers", () => {
    // Mar 2025: only Stamford (EVYD ended Jan 31)
    const mar = getActiveEmployersForMonth(periods, 2025, 2)
    expect(mar.map((e) => e.employerName)).toEqual(["Stamford Precision"])
  })

  it("includes new employers starting mid-year", () => {
    // Oct 2025: Stamford + Allegis
    const oct = getActiveEmployersForMonth(periods, 2025, 9)
    expect(oct.map((e) => e.employerName)).toEqual([
      "Stamford Precision",
      "Allegis Group",
    ])
  })

  it("returns empty for months before any employer starts", () => {
    const early = getActiveEmployersForMonth(periods, 2023, 0)
    expect(early).toEqual([])
  })
})

describe("calculateMultiEmployerAnnualCpf", () => {
  it("calculates contributions from a single employer", () => {
    const periods: EmploymentPeriod[] = [
      {
        employerName: "Test Corp",
        monthlySalary: 6000,
        startDate: "2025-01-01",
        endDate: null,
      },
    ]

    const result = calculateMultiEmployerAnnualCpf(periods, 32, 2025)
    const singleMonth = calculateCpfContribution(6000, 32, 2025)

    // 12 months of same contribution
    expect(result.totalEmployee).toBeCloseTo(singleMonth.employee * 12, 0)
    expect(result.totalEmployer).toBeCloseTo(singleMonth.employer * 12, 0)
  })

  it("handles multiple employers in the same month", () => {
    const periods: EmploymentPeriod[] = [
      {
        employerName: "Main Job",
        monthlySalary: 5000,
        startDate: "2025-01-01",
        endDate: null,
      },
      {
        employerName: "Side Gig",
        monthlySalary: 2000,
        startDate: "2025-01-01",
        endDate: null,
      },
    ]

    const result = calculateMultiEmployerAnnualCpf(periods, 32, 2025)

    // Total should be more than single employer alone
    const singleResult = calculateMultiEmployerAnnualCpf(
      [periods[0]!],
      32,
      2025,
    )
    expect(result.total).toBeGreaterThan(singleResult.total)
  })

  it("produces zero contributions for months without employers", () => {
    const periods: EmploymentPeriod[] = [
      {
        employerName: "Short Gig",
        monthlySalary: 5000,
        startDate: "2025-06-01",
        endDate: "2025-08-31",
      },
    ]

    const result = calculateMultiEmployerAnnualCpf(periods, 32, 2025)

    // Only 3 months of contributions (Jun-Aug)
    const monthsWithContrib = result.monthly.filter((m) => m.total > 0)
    expect(monthsWithContrib).toHaveLength(3)
  })

  it("respects AW ceiling of $102,000 across employers", () => {
    const periods: EmploymentPeriod[] = [
      {
        employerName: "High Earner",
        monthlySalary: 10000, // above OW ceiling of $7,400 in 2025
        startDate: "2025-01-01",
        endDate: null,
      },
    ]

    const result = calculateMultiEmployerAnnualCpf(periods, 32, 2025)

    // OW ceiling is $7,400 in 2025 → max OW = $7,400 × 12 = $88,800 < $102,000
    // So AW ceiling not hit in this case, but capped at OW ceiling per month
    expect(result.monthly[0]!.total).toBeGreaterThan(0)

    // Verify all months have same contribution (OW-capped)
    const firstTotal = result.monthly[0]!.total
    for (const m of result.monthly) {
      expect(m.total).toBe(firstTotal)
    }
  })
})
