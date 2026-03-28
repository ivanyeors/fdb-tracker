import {
  getActiveEvents,
  getUpcomingEvents,
  toDateThisYear,
  SEASONALITY_EVENTS,
} from "@/lib/investments/seasonality"

describe("toDateThisYear", () => {
  it("resolves month/day to the current year", () => {
    const ref = new Date(2026, 0, 15) // Jan 15 2026
    const d = toDateThisYear(3, 20, ref)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2) // March = 2
    expect(d.getDate()).toBe(20)
  })
})

describe("getActiveEvents", () => {
  it("returns earning season event during Jan 2–12", () => {
    const active = getActiveEvents(new Date(2026, 0, 5)) // Jan 5
    const ids = active.map((e) => e.id)
    expect(ids).toContain("q1-earnings")
  })

  it("returns nothing on a quiet date", () => {
    // Feb 15 — between Jan effect fade (ends Feb 10) and Feb opex (Feb 20)
    const active = getActiveEvents(new Date(2026, 1, 15))
    expect(active.length).toBe(0)
  })

  it("matches single-day events exactly", () => {
    // Feb 20 — options expiring (single day)
    const active = getActiveEvents(new Date(2026, 1, 20))
    const ids = active.map((e) => e.id)
    expect(ids).toContain("feb-opex")
  })

  it("does not match single-day events on adjacent days", () => {
    const before = getActiveEvents(new Date(2026, 1, 19))
    const after = getActiveEvents(new Date(2026, 1, 21))
    expect(before.map((e) => e.id)).not.toContain("feb-opex")
    expect(after.map((e) => e.id)).not.toContain("feb-opex")
  })

  it("includes both risk and opportunity when they overlap", () => {
    // Jul 18 — summer liquidity vacuum (risk, Jun 15–Jul 5 ended) + jul-entry (opportunity, Jul 18–25)
    const active = getActiveEvents(new Date(2026, 6, 18))
    const types = new Set(active.map((e) => e.type))
    expect(types.has("opportunity")).toBe(true)
    expect(active.map((e) => e.id)).toContain("jul-entry")
  })

  it("matches start boundary of a range", () => {
    const active = getActiveEvents(new Date(2026, 4, 1)) // May 1 = sell-in-may start
    expect(active.map((e) => e.id)).toContain("sell-in-may")
  })

  it("matches end boundary of a range", () => {
    const active = getActiveEvents(new Date(2026, 4, 20)) // May 20 = sell-in-may end
    expect(active.map((e) => e.id)).toContain("sell-in-may")
  })

  it("does not match day after range ends", () => {
    const active = getActiveEvents(new Date(2026, 4, 21)) // May 21
    expect(active.map((e) => e.id)).not.toContain("sell-in-may")
  })
})

describe("getUpcomingEvents", () => {
  it("returns events starting within N days", () => {
    // Feb 17 — Feb opex (Feb 20) is 3 days away
    const upcoming = getUpcomingEvents(new Date(2026, 1, 17), 7)
    const ids = upcoming.map((e) => e.id)
    expect(ids).toContain("feb-opex")
  })

  it("does not include already-active events", () => {
    // Jan 5 — q1-earnings is already active, should not appear in upcoming
    const upcoming = getUpcomingEvents(new Date(2026, 0, 5), 30)
    const ids = upcoming.map((e) => e.id)
    expect(ids).not.toContain("q1-earnings")
  })

  it("respects the daysAhead limit", () => {
    // Feb 17 with 2-day horizon — Feb opex (Feb 20) is 3 days away, should NOT appear
    const upcoming = getUpcomingEvents(new Date(2026, 1, 17), 2)
    const ids = upcoming.map((e) => e.id)
    expect(ids).not.toContain("feb-opex")
  })

  it("returns empty when nothing is upcoming", () => {
    // Dec 30 — santa rally is active (Dec 23–31), nothing else upcoming within 7 days (wraps to next year)
    const upcoming = getUpcomingEvents(new Date(2026, 11, 30), 7)
    // Only events that start in the remaining 1 day of the year
    expect(upcoming.length).toBe(0)
  })
})

describe("SEASONALITY_EVENTS dataset", () => {
  it("has 23 total events (16 risk + 7 opportunity)", () => {
    expect(SEASONALITY_EVENTS.length).toBe(23)
    expect(SEASONALITY_EVENTS.filter((e) => e.type === "risk").length).toBe(16)
    expect(
      SEASONALITY_EVENTS.filter((e) => e.type === "opportunity").length,
    ).toBe(7)
  })

  it("all events have valid month/day ranges", () => {
    for (const e of SEASONALITY_EVENTS) {
      expect(e.startMonth).toBeGreaterThanOrEqual(1)
      expect(e.startMonth).toBeLessThanOrEqual(12)
      expect(e.startDay).toBeGreaterThanOrEqual(1)
      expect(e.startDay).toBeLessThanOrEqual(31)
      expect(e.endMonth).toBeGreaterThanOrEqual(1)
      expect(e.endMonth).toBeLessThanOrEqual(12)
      expect(e.endDay).toBeGreaterThanOrEqual(1)
      expect(e.endDay).toBeLessThanOrEqual(31)
    }
  })

  it("all events have unique ids", () => {
    const ids = SEASONALITY_EVENTS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
