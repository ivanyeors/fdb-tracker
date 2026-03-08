import {
  getEffectiveOutflow,
  calculateClosingBalance,
  buildBalanceTimeline,
  calculateSavingsRate,
} from "@/lib/calculations/bank-balance";

describe("getEffectiveOutflow", () => {
  it("sums discretionary + insurance + ILP + loan", () => {
    const result = getEffectiveOutflow({
      discretionary: 3000,
      insurancePremiums: 200,
      ilpPremiums: 500,
      loanRepayments: 0,
    });
    expect(result.total).toBe(3700);
    expect(result.discretionary).toBe(3000);
    expect(result.insurancePremiums).toBe(200);
    expect(result.ilpPremiums).toBe(500);
    expect(result.loanRepayments).toBe(0);
    expect(result.taxProvision).toBe(0);
  });

  it("includes tax provision when provided", () => {
    const result = getEffectiveOutflow({
      discretionary: 3000,
      insurancePremiums: 200,
      ilpPremiums: 500,
      loanRepayments: 0,
      taxProvision: 300,
    });
    expect(result.total).toBe(4000);
    expect(result.taxProvision).toBe(300);
  });

  it("includes loan repayments", () => {
    const result = getEffectiveOutflow({
      discretionary: 3000,
      insurancePremiums: 200,
      ilpPremiums: 500,
      loanRepayments: 1500,
    });
    expect(result.total).toBe(5200);
  });

  it("handles all zeros", () => {
    const result = getEffectiveOutflow({
      discretionary: 0,
      insurancePremiums: 0,
      ilpPremiums: 0,
      loanRepayments: 0,
    });
    expect(result.total).toBe(0);
  });
});

describe("calculateClosingBalance", () => {
  it("computes opening + inflow - outflow correctly", () => {
    const outflow = getEffectiveOutflow({
      discretionary: 3000,
      insurancePremiums: 200,
      ilpPremiums: 500,
      loanRepayments: 0,
    });
    const closing = calculateClosingBalance(10000, 5600, outflow);
    expect(closing).toBe(11900);
  });

  it("subtracts stock purchases", () => {
    const outflow = getEffectiveOutflow({
      discretionary: 3000,
      insurancePremiums: 0,
      ilpPremiums: 0,
      loanRepayments: 0,
    });
    const closing = calculateClosingBalance(10000, 5000, outflow, 1000);
    expect(closing).toBe(11000);
  });

  it("can result in negative closing balance", () => {
    const outflow = getEffectiveOutflow({
      discretionary: 10000,
      insurancePremiums: 0,
      ilpPremiums: 0,
      loanRepayments: 0,
    });
    const closing = calculateClosingBalance(1000, 5000, outflow);
    expect(closing).toBe(-4000);
  });

  it("defaults stock purchases to 0 when omitted", () => {
    const outflow = getEffectiveOutflow({
      discretionary: 1000,
      insurancePremiums: 0,
      ilpPremiums: 0,
      loanRepayments: 0,
    });
    const closing = calculateClosingBalance(5000, 3000, outflow);
    expect(closing).toBe(7000);
  });
});

describe("buildBalanceTimeline", () => {
  it("chains months so closing becomes next opening", () => {
    const timeline = buildBalanceTimeline({
      openingBalance: 10000,
      monthlyData: [
        {
          month: "2026-01",
          inflow: 5600,
          discretionaryOutflow: 3000,
          insurancePremiums: 200,
          ilpPremiums: 500,
          loanRepayments: 0,
        },
        {
          month: "2026-02",
          inflow: 5600,
          discretionaryOutflow: 3000,
          insurancePremiums: 200,
          ilpPremiums: 500,
          loanRepayments: 0,
        },
        {
          month: "2026-03",
          inflow: 5600,
          discretionaryOutflow: 3000,
          insurancePremiums: 200,
          ilpPremiums: 500,
          loanRepayments: 0,
        },
      ],
    });

    expect(timeline).toHaveLength(3);
    expect(timeline[0].openingBalance).toBe(10000);
    expect(timeline[0].closingBalance).toBe(11900);
    expect(timeline[1].openingBalance).toBe(11900);
    expect(timeline[1].closingBalance).toBe(13800);
    expect(timeline[2].openingBalance).toBe(13800);
    expect(timeline[2].closingBalance).toBe(15700);
  });

  it("returns empty array for no monthly data", () => {
    const timeline = buildBalanceTimeline({
      openingBalance: 10000,
      monthlyData: [],
    });
    expect(timeline).toHaveLength(0);
  });

  it("records correct month labels", () => {
    const timeline = buildBalanceTimeline({
      openingBalance: 0,
      monthlyData: [
        {
          month: "2026-06",
          inflow: 1000,
          discretionaryOutflow: 500,
          insurancePremiums: 0,
          ilpPremiums: 0,
          loanRepayments: 0,
        },
      ],
    });
    expect(timeline[0].month).toBe("2026-06");
  });

  it("includes stock purchases in balance calculation", () => {
    const timeline = buildBalanceTimeline({
      openingBalance: 10000,
      monthlyData: [
        {
          month: "2026-01",
          inflow: 5000,
          discretionaryOutflow: 2000,
          insurancePremiums: 0,
          ilpPremiums: 0,
          loanRepayments: 0,
          stockPurchasesNet: 1000,
        },
      ],
    });
    expect(timeline[0].closingBalance).toBe(12000);
    expect(timeline[0].stockPurchasesNet).toBe(1000);
  });
});

describe("calculateSavingsRate", () => {
  it("computes savings rate as percentage", () => {
    const rate = calculateSavingsRate(5600, 3700);
    expect(rate).toBeCloseTo(33.93, 1);
  });

  it("returns 0 for zero inflow (no division by zero)", () => {
    const rate = calculateSavingsRate(0, 3700);
    expect(rate).toBe(0);
  });

  it("returns 100% when outflow is zero", () => {
    const rate = calculateSavingsRate(5000, 0);
    expect(rate).toBe(100);
  });

  it("returns negative rate when outflow exceeds inflow", () => {
    const rate = calculateSavingsRate(3000, 5000);
    expect(rate).toBeCloseTo(-66.67, 1);
  });
});
