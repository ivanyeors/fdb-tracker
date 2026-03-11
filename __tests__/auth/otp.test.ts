import { beforeEach, describe, expect, it, vi } from "vitest"

import { generateAndStoreOtp } from "@/lib/auth/otp"
import { createSupabaseAdmin } from "@/lib/supabase/server"

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: vi.fn(),
}))

const createSupabaseAdminMock = vi.mocked(createSupabaseAdmin)

describe("generateAndStoreOtp", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("returns a rate-limit error after three recent OTPs", async () => {
    const rateLimitBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({
        count: 3,
        error: null,
      }),
    }

    createSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue(rateLimitBuilder),
    } as never)

    await expect(generateAndStoreOtp("household-1")).resolves.toEqual({
      ok: false,
      stage: "rate_limit",
      error: "Too many OTP requests. Please wait before trying again.",
    })
  })

  it("returns the Supabase error when the rate-limit check fails", async () => {
    const rateLimitBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({
        count: null,
        error: {
          code: "PGRST301",
          message: "JWT expired",
        },
      }),
    }

    createSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue(rateLimitBuilder),
    } as never)

    await expect(generateAndStoreOtp("household-1")).resolves.toEqual({
      ok: false,
      stage: "rate_limit",
      error: "Failed to check OTP rate limit",
      code: "PGRST301",
    })
  })

  it("stores a new OTP when the household is under the rate limit", async () => {
    const rateLimitBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({
        count: 0,
        error: null,
      }),
    }
    const insertBuilder = {
      insert: vi.fn().mockResolvedValue({
        error: null,
      }),
    }
    const from = vi
      .fn()
      .mockReturnValueOnce(rateLimitBuilder)
      .mockReturnValueOnce(insertBuilder)

    createSupabaseAdminMock.mockReturnValue({ from } as never)
    vi.spyOn(Math, "random").mockReturnValue(0)

    await expect(generateAndStoreOtp("household-1")).resolves.toEqual({
      ok: true,
      otp: "100000",
    })

    expect(insertBuilder.insert).toHaveBeenCalledOnce()
  })
})
