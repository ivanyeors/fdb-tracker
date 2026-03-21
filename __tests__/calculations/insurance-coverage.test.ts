import {
  calculateCoverageGap,
  calculateOverallScore,
  getHouseholdCoverage,
  getCoverageRecommendation,
} from "@/lib/calculations/insurance"
import {
  getAnnualPremium,
  getMonthlyEquivalent,
  getUpcomingPremiums,
  projectPremiumByAge,
} from "@/lib/calculations/insurance-premium"

const makePolicy = (
  overrides: Partial<{
    coverage_type: string | null
    coverage_amount: number | null
    is_active: boolean
    type: string
  }> = {},
) => ({
  coverage_type: "death" as string | null,
  coverage_amount: 0 as number | null,
  is_active: true,
  type: "term_life",
  ...overrides,
})

describe("calculateCoverageGap", () => {
  it("calculates gaps against LIA benchmarks for $100k salary", () => {
    const items = calculateCoverageGap([], 100_000)

    const death = items.find((i) => i.coverageType === "death")!
    expect(death.needed).toBe(900_000)
    expect(death.held).toBe(0)
    expect(death.gap).toBe(900_000)
    expect(death.gapPct).toBe(100)

    const ci = items.find((i) => i.coverageType === "critical_illness")!
    expect(ci.needed).toBe(400_000)
    expect(ci.gap).toBe(400_000)

    const disability = items.find((i) => i.coverageType === "disability")!
    expect(disability.needed).toBe(100_000 / 12 * 0.75 * 60)
    expect(disability.gap).toBe(disability.needed)
  })

  it("calculates partial coverage correctly", () => {
    const policies = [
      makePolicy({ coverage_type: "death", coverage_amount: 500_000 }),
    ]
    const items = calculateCoverageGap(policies, 100_000)

    const death = items.find((i) => i.coverageType === "death")!
    expect(death.held).toBe(500_000)
    expect(death.gap).toBe(400_000)
    expect(Math.round(death.gapPct * 100) / 100).toBeCloseTo(44.44, 1)
  })

  it("sums multiple policies of same coverage type", () => {
    const policies = [
      makePolicy({ coverage_type: "death", coverage_amount: 300_000 }),
      makePolicy({ coverage_type: "death", coverage_amount: 200_000, type: "whole_life" }),
    ]
    const items = calculateCoverageGap(policies, 100_000)

    const death = items.find((i) => i.coverageType === "death")!
    expect(death.held).toBe(500_000)
  })

  it("excludes inactive policies", () => {
    const policies = [
      makePolicy({ coverage_type: "death", coverage_amount: 500_000, is_active: false }),
    ]
    const items = calculateCoverageGap(policies, 100_000)

    const death = items.find((i) => i.coverageType === "death")!
    expect(death.held).toBe(0)
  })

  it("detects hospitalization as boolean ISP check", () => {
    const withISP = [makePolicy({ type: "integrated_shield", coverage_type: "hospitalization" })]
    const withoutISP: typeof withISP = []

    const itemsWithISP = calculateCoverageGap(withISP, 100_000)
    const hosp = itemsWithISP.find((i) => i.coverageType === "hospitalization")!
    expect(hosp.hasCoverage).toBe(true)
    expect(hosp.gapPct).toBe(0)

    const itemsWithout = calculateCoverageGap(withoutISP, 100_000)
    const hospNo = itemsWithout.find((i) => i.coverageType === "hospitalization")!
    expect(hospNo.hasCoverage).toBe(false)
    expect(hospNo.gapPct).toBe(100)
  })

  it("personal accident has no benchmark (needed=0)", () => {
    const items = calculateCoverageGap([], 100_000)
    const pa = items.find((i) => i.coverageType === "personal_accident")!
    expect(pa.needed).toBe(0)
    expect(pa.gap).toBe(0)
    expect(pa.gapPct).toBe(0)
  })

  it("uses custom benchmarks when provided", () => {
    const items = calculateCoverageGap([], 100_000, {
      deathTarget: 1_000_000,
      ciTarget: 500_000,
    })

    expect(items.find((i) => i.coverageType === "death")!.needed).toBe(1_000_000)
    expect(items.find((i) => i.coverageType === "critical_illness")!.needed).toBe(500_000)
  })

  it("handles zero salary (all benchmarks = 0)", () => {
    const items = calculateCoverageGap([], 0)

    const death = items.find((i) => i.coverageType === "death")!
    expect(death.needed).toBe(0)
    expect(death.gap).toBe(0)
    expect(death.gapPct).toBe(0)
  })

  it("clamps gap to zero when over-covered", () => {
    const policies = [
      makePolicy({ coverage_type: "death", coverage_amount: 2_000_000 }),
    ]
    const items = calculateCoverageGap(policies, 100_000)

    const death = items.find((i) => i.coverageType === "death")!
    expect(death.gap).toBe(0)
    expect(death.gapPct).toBe(0)
  })
})

describe("calculateOverallScore", () => {
  it("returns 100 for full coverage", () => {
    const items = calculateCoverageGap(
      [
        makePolicy({ coverage_type: "death", coverage_amount: 900_000 }),
        makePolicy({ coverage_type: "critical_illness", coverage_amount: 400_000, type: "critical_illness" }),
        makePolicy({ type: "integrated_shield", coverage_type: "hospitalization" }),
        makePolicy({ coverage_type: "disability", coverage_amount: 375_000 }),
        makePolicy({ coverage_type: "personal_accident", coverage_amount: 100_000, type: "personal_accident" }),
      ],
      100_000,
    )
    expect(calculateOverallScore(items)).toBe(100)
  })

  it("returns 0 for no coverage with income", () => {
    const items = calculateCoverageGap([], 100_000)
    expect(calculateOverallScore(items)).toBe(0)
  })

  it("returns weighted partial score", () => {
    const items = calculateCoverageGap(
      [
        makePolicy({ coverage_type: "death", coverage_amount: 450_000 }),
      ],
      100_000,
    )
    const score = calculateOverallScore(items)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(50)
  })
})

describe("getHouseholdCoverage", () => {
  it("combines multiple profiles", () => {
    const result = getHouseholdCoverage([
      {
        profileId: "p1",
        profileName: "Person A",
        annualSalary: 100_000,
        policies: [
          makePolicy({ coverage_type: "death", coverage_amount: 500_000 }),
        ],
      },
      {
        profileId: "p2",
        profileName: "Person B",
        annualSalary: 80_000,
        policies: [
          makePolicy({ coverage_type: "death", coverage_amount: 300_000 }),
        ],
      },
    ])

    expect(result.profiles).toHaveLength(2)
    const combinedDeath = result.combined.find((i) => i.coverageType === "death")!
    expect(combinedDeath.held).toBe(800_000)
    expect(combinedDeath.needed).toBe(900_000 + 720_000)
  })

  it("hospitalization combined requires all profiles covered", () => {
    const result = getHouseholdCoverage([
      {
        profileId: "p1",
        profileName: "Person A",
        annualSalary: 100_000,
        policies: [makePolicy({ type: "integrated_shield", coverage_type: "hospitalization" })],
      },
      {
        profileId: "p2",
        profileName: "Person B",
        annualSalary: 80_000,
        policies: [],
      },
    ])

    const hosp = result.combined.find((i) => i.coverageType === "hospitalization")!
    expect(hosp.hasCoverage).toBe(true)
    expect(hosp.gapPct).toBe(100) // not all covered
  })
})

describe("getCoverageRecommendation", () => {
  it("returns null when fully covered", () => {
    expect(getCoverageRecommendation({
      coverageType: "death",
      label: "Death / Life",
      held: 900_000,
      needed: 900_000,
      gap: 0,
      gapPct: 0,
      hasCoverage: true,
    })).toBeNull()
  })

  it("returns recommendation for death gap", () => {
    const rec = getCoverageRecommendation({
      coverageType: "death",
      label: "Death / Life",
      held: 500_000,
      needed: 900_000,
      gap: 400_000,
      gapPct: 44.44,
      hasCoverage: true,
    })
    expect(rec).toContain("term life")
    expect(rec).toContain("400,000")
  })

  it("returns recommendation for no ISP", () => {
    const rec = getCoverageRecommendation({
      coverageType: "hospitalization",
      label: "Hospitalization",
      held: 0,
      needed: 1,
      gap: 1,
      gapPct: 100,
      hasCoverage: false,
    })
    expect(rec).toContain("Integrated Shield Plan")
  })
})

describe("getAnnualPremium", () => {
  it("multiplies monthly by 12", () => {
    expect(getAnnualPremium(200, "monthly")).toBe(2400)
  })

  it("returns yearly as-is", () => {
    expect(getAnnualPremium(2400, "yearly")).toBe(2400)
  })
})

describe("getMonthlyEquivalent", () => {
  it("returns monthly as-is", () => {
    expect(getMonthlyEquivalent(200, "monthly")).toBe(200)
  })

  it("divides yearly by 12", () => {
    expect(getMonthlyEquivalent(2400, "yearly")).toBe(200)
  })
})

describe("getUpcomingPremiums", () => {
  const monthlyPolicy = {
    name: "Term Life",
    type: "term_life",
    premium_amount: 200,
    frequency: "monthly",
    yearly_outflow_date: null,
    is_active: true,
  }

  const yearlyPolicy = {
    name: "Shield",
    type: "integrated_shield",
    premium_amount: 2400,
    frequency: "yearly",
    yearly_outflow_date: 6,
    is_active: true,
  }

  it("shows monthly policy in all 12 months", () => {
    const result = getUpcomingPremiums([monthlyPolicy], 1)
    expect(result).toHaveLength(12)
    for (const month of result) {
      expect(month.premiums).toHaveLength(1)
      expect(month.premiums[0].isRecurring).toBe(true)
      expect(month.total).toBe(200)
    }
  })

  it("shows yearly policy only in due month", () => {
    const result = getUpcomingPremiums([yearlyPolicy], 1)
    const june = result.find((m) => m.month === 6)!
    expect(june.premiums).toHaveLength(1)
    expect(june.premiums[0].amount).toBe(2400)
    expect(june.premiums[0].isRecurring).toBe(false)

    const jan = result.find((m) => m.month === 1)!
    expect(jan.premiums).toHaveLength(0)
  })

  it("excludes inactive policies", () => {
    const result = getUpcomingPremiums(
      [{ ...monthlyPolicy, is_active: false }],
      1,
    )
    for (const month of result) {
      expect(month.premiums).toHaveLength(0)
    }
  })

  it("starts from current month and wraps around", () => {
    const result = getUpcomingPremiums([], 10)
    expect(result[0].month).toBe(10)
    expect(result[2].month).toBe(12)
    expect(result[3].month).toBe(1)
  })
})

describe("projectPremiumByAge", () => {
  it("projects premiums for age bands", () => {
    const schedule = [
      { age_band_min: 21, age_band_max: 30, premium: 200 },
      { age_band_min: 31, age_band_max: 40, premium: 500 },
      { age_band_min: 41, age_band_max: 50, premium: 900 },
    ]
    const result = projectPremiumByAge(schedule, 28)
    expect(result[0]).toEqual({ age: 28, premium: 200 })
    expect(result.find((r) => r.age === 31)?.premium).toBe(500)
    expect(result[result.length - 1].age).toBe(50)
  })

  it("returns empty for empty schedule", () => {
    expect(projectPremiumByAge([], 30)).toEqual([])
  })
})
