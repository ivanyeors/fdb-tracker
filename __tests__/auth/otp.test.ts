import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  OTP_RATE_LIMIT_PER_HOUR,
  generateAndStoreOtp,
} from "@/lib/auth/otp"
import { createSupabaseAdmin } from "@/lib/supabase/server"

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: vi.fn(),
}))

const createSupabaseAdminMock = vi.mocked(createSupabaseAdmin)

function buildSupabaseMock(opts: {
  recentCount?: number
  countError?: { code: string } | null
  insertError?: { code: string } | null
}) {
  const insert = vi
    .fn()
    .mockResolvedValue({ error: opts.insertError ?? null })

  // Rate-limit chain: from("otp_tokens").select(..., { count, head }).eq(...).gte(...)
  const gte = vi
    .fn()
    .mockResolvedValue({
      count: opts.recentCount ?? 0,
      error: opts.countError ?? null,
    })
  const eq = vi.fn().mockReturnValue({ gte })
  const select = vi.fn().mockReturnValue({ eq })

  const from = vi.fn().mockReturnValue({ select, insert })
  return { from, select, eq, gte, insert }
}

describe("generateAndStoreOtp", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("stores a new OTP when under the rate limit", async () => {
    const mock = buildSupabaseMock({ recentCount: 0 })
    createSupabaseAdminMock.mockReturnValue({ from: mock.from } as never)
    vi.spyOn(Math, "random").mockReturnValue(0)

    await expect(generateAndStoreOtp("account-1")).resolves.toEqual({
      ok: true,
      otp: "100000",
    })

    expect(mock.insert).toHaveBeenCalledOnce()
  })

  it("rejects when the household has already requested the per-hour limit", async () => {
    const mock = buildSupabaseMock({ recentCount: OTP_RATE_LIMIT_PER_HOUR })
    createSupabaseAdminMock.mockReturnValue({ from: mock.from } as never)

    const result = await generateAndStoreOtp("account-1")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("create")
      expect(result.error).toMatch(/too many otp/i)
    }
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("propagates insert errors with their code", async () => {
    const mock = buildSupabaseMock({
      recentCount: 1,
      insertError: { code: "PGRST301" },
    })
    createSupabaseAdminMock.mockReturnValue({ from: mock.from } as never)

    const result = await generateAndStoreOtp("account-1")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("PGRST301")
    }
  })
})
