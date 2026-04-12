import { calculateSelfHelpContribution } from "@/lib/calculations/self-help-group"

describe("calculateSelfHelpContribution", () => {
  describe("CDAC rates", () => {
    it("returns $0.50 for gross <= $2,000", () => {
      expect(calculateSelfHelpContribution(2000, "cdac").monthlyAmount).toBe(0.5)
      expect(calculateSelfHelpContribution(1500, "cdac").monthlyAmount).toBe(0.5)
    })

    it("returns $1.00 for gross > $2,000 to $3,500", () => {
      expect(calculateSelfHelpContribution(2001, "cdac").monthlyAmount).toBe(1.0)
      expect(calculateSelfHelpContribution(3500, "cdac").monthlyAmount).toBe(1.0)
    })

    it("returns $1.50 for gross > $3,500 to $5,000", () => {
      expect(calculateSelfHelpContribution(3501, "cdac").monthlyAmount).toBe(1.5)
      expect(calculateSelfHelpContribution(5000, "cdac").monthlyAmount).toBe(1.5)
    })

    it("returns $2.00 for gross > $5,000 to $7,500", () => {
      expect(calculateSelfHelpContribution(5001, "cdac").monthlyAmount).toBe(2.0)
      expect(calculateSelfHelpContribution(7000, "cdac").monthlyAmount).toBe(2.0)
      expect(calculateSelfHelpContribution(7500, "cdac").monthlyAmount).toBe(2.0)
    })

    it("returns $3.00 for gross > $7,500", () => {
      expect(calculateSelfHelpContribution(7501, "cdac").monthlyAmount).toBe(3.0)
      expect(calculateSelfHelpContribution(10000, "cdac").monthlyAmount).toBe(3.0)
    })

    it("computes correct annual amount", () => {
      const result = calculateSelfHelpContribution(7000, "cdac")
      expect(result.annualAmount).toBe(24)
    })
  })

  describe("none (opted out)", () => {
    it("returns 0 for group none", () => {
      const result = calculateSelfHelpContribution(7000, "none")
      expect(result.monthlyAmount).toBe(0)
      expect(result.annualAmount).toBe(0)
    })
  })

  describe("zero or negative gross", () => {
    it("returns 0 for zero gross", () => {
      expect(calculateSelfHelpContribution(0, "cdac").monthlyAmount).toBe(0)
    })

    it("returns 0 for negative gross", () => {
      expect(calculateSelfHelpContribution(-1000, "cdac").monthlyAmount).toBe(0)
    })
  })

  describe("other self-help groups", () => {
    it("SINDA returns a positive amount for valid salary", () => {
      const result = calculateSelfHelpContribution(5000, "sinda")
      expect(result.monthlyAmount).toBeGreaterThan(0)
    })

    it("MBMF returns a positive amount for valid salary", () => {
      const result = calculateSelfHelpContribution(5000, "mbmf")
      expect(result.monthlyAmount).toBeGreaterThan(0)
    })

    it("ECF returns a positive amount for valid salary", () => {
      const result = calculateSelfHelpContribution(5000, "ecf")
      expect(result.monthlyAmount).toBeGreaterThan(0)
    })
  })

  describe("result shape", () => {
    it("includes group in result", () => {
      const result = calculateSelfHelpContribution(7000, "cdac")
      expect(result.group).toBe("cdac")
    })
  })
})
