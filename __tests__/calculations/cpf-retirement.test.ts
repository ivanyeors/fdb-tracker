import {
  getRetirementSums,
  projectCpfGrowth,
  calculateRetirementGap,
  findBenchmarkAge,
  type CpfProjectionPoint,
} from "@/lib/calculations/cpf-retirement";
import { calculateCpfContribution } from "@/lib/calculations/cpf";

describe("getRetirementSums", () => {
  it("returns correct 2026 sums", () => {
    const sums = getRetirementSums(2026);
    expect(sums.brs).toBe(110200);
    expect(sums.frs).toBe(220400);
    expect(sums.ers).toBe(440800);
  });

  it("returns correct 2025 sums", () => {
    const sums = getRetirementSums(2025);
    expect(sums.brs).toBe(106500);
    expect(sums.frs).toBe(213000);
    expect(sums.ers).toBe(426000);
  });

  it("returns correct 2027 sums", () => {
    const sums = getRetirementSums(2027);
    expect(sums.brs).toBe(114100);
    expect(sums.frs).toBe(228200);
    expect(sums.ers).toBe(456400);
  });

  it("defaults to 2026 for unknown year", () => {
    const sums = getRetirementSums(2030);
    expect(sums.frs).toBe(220400);
  });

  it("defaults to 2026 when no argument provided", () => {
    const sums = getRetirementSums();
    expect(sums.frs).toBe(220400);
  });

  it("includes monthly payout ranges", () => {
    const sums = getRetirementSums(2026);
    expect(sums.brsMonthlyPayout).toEqual({ min: 890, max: 930 });
    expect(sums.frsMonthlyPayout).toEqual({ min: 1640, max: 1750 });
    expect(sums.ersMonthlyPayout).toEqual({ min: 3180, max: 3410 });
  });
});

describe("calculateRetirementGap", () => {
  it("computes gap of $70,400 for $150k current vs $220,400 FRS", () => {
    const result = calculateRetirementGap(150000, 220400);
    expect(result.gap).toBe(70400);
    expect(result.gapPercentage).toBeCloseTo(31.94, 1);
    expect(result.onTrack).toBe(false);
    expect(result.current).toBe(150000);
    expect(result.target).toBe(220400);
  });

  it("shows on-track when current exceeds target", () => {
    const result = calculateRetirementGap(250000, 220400);
    expect(result.gap).toBeLessThan(0);
    expect(result.onTrack).toBe(true);
  });

  it("shows on-track when current equals target", () => {
    const result = calculateRetirementGap(220400, 220400);
    expect(result.gap).toBe(0);
    expect(result.onTrack).toBe(true);
  });

  it("handles zero target without division by zero", () => {
    const result = calculateRetirementGap(50000, 0);
    expect(result.gapPercentage).toBe(0);
  });
});

describe("projectCpfGrowth", () => {
  it("returns empty array when targetAge <= currentAge", () => {
    const monthlyContribution = calculateCpfContribution(6000, 30, 2026);
    const points = projectCpfGrowth({
      currentOa: 20000,
      currentSa: 10000,
      currentMa: 8000,
      monthlyContribution,
      currentAge: 30,
      targetAge: 30,
    });
    expect(points).toHaveLength(0);
  });

  it("returns correct number of points", () => {
    const monthlyContribution = calculateCpfContribution(6000, 30, 2026);
    const points = projectCpfGrowth({
      currentOa: 20000,
      currentSa: 10000,
      currentMa: 8000,
      monthlyContribution,
      currentAge: 30,
      targetAge: 35,
    });
    expect(points).toHaveLength(6);
  });

  it("shows total growing over time", () => {
    const monthlyContribution = calculateCpfContribution(6000, 30, 2026);
    const points = projectCpfGrowth({
      currentOa: 20000,
      currentSa: 10000,
      currentMa: 8000,
      monthlyContribution,
      currentAge: 30,
      targetAge: 40,
    });

    for (let i = 1; i < points.length; i++) {
      expect(points[i].total).toBeGreaterThan(points[i - 1].total);
    }
  });

  it("each point has OA + SA + MA = total", () => {
    const monthlyContribution = calculateCpfContribution(6000, 30, 2026);
    const points = projectCpfGrowth({
      currentOa: 20000,
      currentSa: 10000,
      currentMa: 8000,
      monthlyContribution,
      currentAge: 30,
      targetAge: 35,
    });

    for (const p of points) {
      expect(p.oa + p.sa + p.ma).toBeCloseTo(p.total, 1);
    }
  });

  it("respects custom income growth rate", () => {
    const monthlyContribution = calculateCpfContribution(6000, 30, 2026);
    const pointsDefault = projectCpfGrowth({
      currentOa: 20000,
      currentSa: 10000,
      currentMa: 8000,
      monthlyContribution,
      currentAge: 30,
      targetAge: 40,
    });

    const pointsHighGrowth = projectCpfGrowth({
      currentOa: 20000,
      currentSa: 10000,
      currentMa: 8000,
      monthlyContribution,
      currentAge: 30,
      targetAge: 40,
      incomeGrowthRate: 0.10,
    });

    const lastDefault = pointsDefault[pointsDefault.length - 1];
    const lastHighGrowth = pointsHighGrowth[pointsHighGrowth.length - 1];
    expect(lastHighGrowth.total).toBeGreaterThan(lastDefault.total);
  });

  it("includes age 55+ extra interest bonus", () => {
    const monthlyContribution = calculateCpfContribution(6000, 50, 2026);
    const points = projectCpfGrowth({
      currentOa: 100000,
      currentSa: 80000,
      currentMa: 40000,
      monthlyContribution,
      currentAge: 50,
      targetAge: 60,
    });

    expect(points.length).toBeGreaterThan(0);
    const last = points[points.length - 1];
    expect(last.total).toBeGreaterThan(100000 + 80000 + 40000);
  });
});

describe("findBenchmarkAge", () => {
  it("finds age when projection crosses target", () => {
    const monthlyContribution = calculateCpfContribution(6000, 30, 2026);
    const points = projectCpfGrowth({
      currentOa: 20000,
      currentSa: 10000,
      currentMa: 8000,
      monthlyContribution,
      currentAge: 30,
      targetAge: 65,
    });

    const frs = 220400;
    const benchmarkAge = findBenchmarkAge(points, frs);

    expect(benchmarkAge).not.toBeNull();
    expect(benchmarkAge).toBeGreaterThanOrEqual(30);
    expect(benchmarkAge).toBeLessThanOrEqual(65);

    const crossPoint = points.find((p) => p.total >= frs);
    expect(crossPoint!.age).toBe(benchmarkAge);
  });

  it("returns null when target is never reached", () => {
    const points: CpfProjectionPoint[] = [
      { age: 30, year: 2026, oa: 1000, sa: 500, ma: 500, total: 2000 },
      { age: 31, year: 2027, oa: 2000, sa: 1000, ma: 1000, total: 4000 },
    ];
    const result = findBenchmarkAge(points, 1000000);
    expect(result).toBeNull();
  });

  it("returns first age if already above target", () => {
    const points: CpfProjectionPoint[] = [
      { age: 50, year: 2046, oa: 150000, sa: 100000, ma: 50000, total: 300000 },
      { age: 51, year: 2047, oa: 160000, sa: 110000, ma: 55000, total: 325000 },
    ];
    const result = findBenchmarkAge(points, 220400);
    expect(result).toBe(50);
  });

  it("returns null for empty projection", () => {
    const result = findBenchmarkAge([], 220400);
    expect(result).toBeNull();
  });
});
