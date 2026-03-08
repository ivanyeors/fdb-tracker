import { calculateTakeHome } from "@/lib/calculations/take-home";

describe("calculateTakeHome", () => {
  it("returns $5,600 monthly take-home for $84k salary, age 30 (birth 1996), 2026", () => {
    const result = calculateTakeHome(84000, 0, 1996, 2026);
    expect(result.monthlyGross).toBe(7000);
    expect(result.monthlyEmployeeCpf).toBe(1400);
    expect(result.monthlyTakeHome).toBe(5600);
  });

  it("caps CPF for high salary above OW ceiling", () => {
    const result = calculateTakeHome(120000, 0, 1996, 2026);
    expect(result.monthlyGross).toBe(10000);
    expect(result.monthlyEmployeeCpf).toBe(1600);
    expect(result.monthlyTakeHome).toBe(8400);
  });

  it("handles zero bonus without AW complications", () => {
    const result = calculateTakeHome(84000, 0, 1996, 2026);
    expect(result.annualGross).toBe(84000);
    expect(result.annualEmployeeCpf).toBe(1400 * 12);
    expect(result.annualTakeHome).toBe(84000 - 1400 * 12);
  });

  it("includes bonus in annual calculations", () => {
    const result = calculateTakeHome(84000, 7000, 1996, 2026);
    expect(result.annualGross).toBe(91000);
    expect(result.annualTakeHome).toBeLessThan(91000);
    expect(result.annualEmployeeCpf).toBeGreaterThan(1400 * 12);
  });

  it("applies correct CPF rates for age 58 (birth 1968), 2026", () => {
    const result = calculateTakeHome(84000, 0, 1968, 2026);
    expect(result.monthlyEmployeeCpf).toBe(7000 * 0.18);
    expect(result.monthlyTakeHome).toBe(7000 - 7000 * 0.18);
  });

  it("applies correct CPF rates for age 62 (birth 1964), 2026", () => {
    const result = calculateTakeHome(84000, 0, 1964, 2026);
    expect(result.monthlyEmployeeCpf).toBe(7000 * 0.125);
  });

  it("returns cpfContribution breakdown in result", () => {
    const result = calculateTakeHome(84000, 0, 1996, 2026);
    expect(result.cpfContribution).toBeDefined();
    expect(result.cpfContribution.employee).toBe(1400);
    expect(result.cpfContribution.employer).toBe(1190);
    expect(result.cpfContribution.total).toBe(2590);
  });

  it("computes annual employer CPF", () => {
    const result = calculateTakeHome(84000, 0, 1996, 2026);
    expect(result.annualEmployerCpf).toBe(1190 * 12);
  });

  it("handles very low salary", () => {
    const result = calculateTakeHome(12000, 0, 1996, 2026);
    expect(result.monthlyGross).toBe(1000);
    expect(result.monthlyEmployeeCpf).toBe(200);
    expect(result.monthlyTakeHome).toBe(800);
  });
});
