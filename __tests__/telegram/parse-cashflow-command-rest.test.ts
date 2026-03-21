import { describe, expect, it } from "vitest"

import {
  parseAmountAndMemoFromRest,
  parseCashflowOneLine,
} from "@/lib/telegram/parse-cashflow-command-rest"

describe("parseAmountAndMemoFromRest", () => {
  it("parses amount only", () => {
    expect(parseAmountAndMemoFromRest("5000")).toEqual({ amount: 5000 })
  })

  it("parses amount and memo", () => {
    expect(parseAmountAndMemoFromRest("5000 salary credit")).toEqual({
      amount: 5000,
      memo: "salary credit",
    })
  })

  it("returns null for invalid", () => {
    expect(parseAmountAndMemoFromRest("")).toBeNull()
    expect(parseAmountAndMemoFromRest("abc")).toBeNull()
  })
})

describe("parseCashflowOneLine", () => {
  const profiles = [
    { id: "a", name: "John" },
    { id: "b", name: "Mary Jane" },
  ]

  it("single profile: amount and memo", () => {
    expect(parseCashflowOneLine("15000 bonus", [profiles[0]])).toEqual({
      profileId: "a",
      profileName: "John",
      amount: 15000,
      memo: "bonus",
    })
  })

  it("multi profile: name prefix", () => {
    expect(parseCashflowOneLine("Mary Jane 2000 rent", profiles)).toEqual({
      profileId: "b",
      profileName: "Mary Jane",
      amount: 2000,
      memo: "rent",
    })
  })

  it("multi profile: no match without name", () => {
    expect(parseCashflowOneLine("2000 only", profiles)).toBeNull()
  })
})
