import {
  getDownstreamImpacts,
  getImpactsByPage,
  hasDownstreamImpacts,
  IMPACT_NODES,
  IMPACT_EDGES,
  type ImpactNodeId,
} from "@/lib/impact-graph"

describe("IMPACT_EDGES integrity", () => {
  it("all edge endpoints reference valid nodes", () => {
    const nodeIds = new Set(Object.keys(IMPACT_NODES))
    for (const edge of IMPACT_EDGES) {
      expect(nodeIds.has(edge.from)).toBe(true)
      expect(nodeIds.has(edge.to)).toBe(true)
    }
  })

  it("has no self-referencing edges", () => {
    for (const edge of IMPACT_EDGES) {
      expect(edge.from).not.toBe(edge.to)
    }
  })

  it("has no duplicate edges", () => {
    const seen = new Set<string>()
    for (const edge of IMPACT_EDGES) {
      const key = `${edge.from}->${edge.to}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})

describe("getDownstreamImpacts", () => {
  it("returns direct downstream nodes for income.annual_salary", () => {
    const impacts = getDownstreamImpacts("income.annual_salary")
    const ids = impacts.map((n) => n.id)

    expect(ids).toContain("tax.estimated")
    expect(ids).toContain("cpf.projections")
    expect(ids).toContain("insurance.coverage_gaps")
  })

  it("returns transitive downstream nodes", () => {
    // income.annual_salary -> tax.estimated -> tax.monthly_provision
    // income.annual_salary -> tax.estimated -> cashflow.outflow -> bank.balance_forecast
    const impacts = getDownstreamImpacts("income.annual_salary")
    const ids = impacts.map((n) => n.id)

    expect(ids).toContain("tax.monthly_provision")
    expect(ids).toContain("cashflow.outflow")
    expect(ids).toContain("bank.balance_forecast")
  })

  it("returns empty array for leaf nodes", () => {
    const impacts = getDownstreamImpacts("bank.balance_forecast")
    expect(impacts).toHaveLength(0)
  })

  it("does not include the source node itself", () => {
    const impacts = getDownstreamImpacts("income.annual_salary")
    const ids = impacts.map((n) => n.id)
    expect(ids).not.toContain("income.annual_salary")
  })

  it("handles shared downstream nodes without duplicates", () => {
    // cpf.balance_manual -> cpf.projections and cpf.retirement_gap
    // cpf.projections -> cpf.retirement_gap (shared)
    const impacts = getDownstreamImpacts("cpf.balance_manual")
    const ids = impacts.map((n) => n.id)
    const unique = new Set(ids)
    expect(ids.length).toBe(unique.size)
    expect(ids).toContain("cpf.retirement_gap")
  })
})

describe("getImpactsByPage", () => {
  it("groups impacts by dashboard page", () => {
    const grouped = getImpactsByPage("income.annual_salary")

    expect(grouped.has("Tax")).toBe(true)
    expect(grouped.has("CPF")).toBe(true)
    expect(grouped.has("Insurance")).toBe(true)

    const taxNodes = grouped.get("Tax")!
    expect(taxNodes.some((n) => n.id === "tax.estimated")).toBe(true)
  })

  it("returns empty map for leaf nodes", () => {
    const grouped = getImpactsByPage("investments.allocation_pct")
    expect(grouped.size).toBe(0)
  })
})

describe("hasDownstreamImpacts", () => {
  it("returns true for nodes with outgoing edges", () => {
    expect(hasDownstreamImpacts("income.annual_salary")).toBe(true)
    expect(hasDownstreamImpacts("loan.details")).toBe(true)
    expect(hasDownstreamImpacts("cashflow.outflow")).toBe(true)
  })

  it("returns false for leaf nodes", () => {
    expect(hasDownstreamImpacts("bank.balance_forecast")).toBe(false)
    expect(hasDownstreamImpacts("investments.allocation_pct")).toBe(false)
    expect(hasDownstreamImpacts("loan.prepayment_savings")).toBe(false)
  })
})

describe("no cycles in graph", () => {
  it("BFS from every node terminates and never revisits the source", () => {
    const allNodeIds = Object.keys(IMPACT_NODES) as ImpactNodeId[]
    for (const nodeId of allNodeIds) {
      const impacts = getDownstreamImpacts(nodeId)
      const ids = impacts.map((n) => n.id)
      // Source should never appear in its own downstream
      expect(ids).not.toContain(nodeId)
    }
  })
})
