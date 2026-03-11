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

  it("stores a new OTP", async () => {
    const insertBuilder = {
      insert: vi.fn().mockResolvedValue({
        error: null,
      }),
    }
    const from = vi.fn().mockReturnValue(insertBuilder)

    createSupabaseAdminMock.mockReturnValue({ from } as never)
    vi.spyOn(Math, "random").mockReturnValue(0)

    await expect(generateAndStoreOtp("account-1")).resolves.toEqual({
      ok: true,
      otp: "100000",
    })

    expect(insertBuilder.insert).toHaveBeenCalledOnce()
  })
})
