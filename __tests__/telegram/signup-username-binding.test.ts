import { describe, expect, it } from "vitest"

import {
  checkSignupUsernameMatch,
  normalizeTelegramUsername,
} from "@/lib/telegram/scenes/signup-scene"

describe("normalizeTelegramUsername", () => {
  it("strips a leading @ and lowercases", () => {
    expect(normalizeTelegramUsername("@Alice")).toBe("alice")
  })

  it("returns null for null/undefined/empty", () => {
    expect(normalizeTelegramUsername(null)).toBeNull()
    expect(normalizeTelegramUsername(undefined)).toBeNull()
    expect(normalizeTelegramUsername("")).toBeNull()
  })

  it("leaves bare usernames unchanged (after lowercase)", () => {
    expect(normalizeTelegramUsername("bob")).toBe("bob")
  })
})

describe("checkSignupUsernameMatch", () => {
  it("passes when the redeeming username matches (lowercase)", () => {
    expect(checkSignupUsernameMatch("alice", "alice")).toEqual({ ok: true })
  })

  it("passes when redeeming username matches but has different casing", () => {
    expect(checkSignupUsernameMatch("alice", "Alice")).toEqual({ ok: true })
  })

  it("passes when redeeming username has a leading @", () => {
    expect(checkSignupUsernameMatch("alice", "@alice")).toEqual({ ok: true })
  })

  it("rejects when usernames differ", () => {
    const result = checkSignupUsernameMatch("alice", "bob")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.expected).toBe("alice")
      expect(result.actualLabel).toBe("@bob")
    }
  })

  it("rejects when redeeming user has no username", () => {
    const result = checkSignupUsernameMatch("alice", null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.expected).toBe("alice")
      expect(result.actualLabel).toBe("an account with no username")
    }
  })

  it("does not enforce binding when expected is null (legacy code)", () => {
    expect(checkSignupUsernameMatch(null, "anyone")).toEqual({ ok: true })
    expect(checkSignupUsernameMatch(null, null)).toEqual({ ok: true })
  })
})
