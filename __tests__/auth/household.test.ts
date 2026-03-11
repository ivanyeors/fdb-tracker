import { beforeEach, describe, expect, it, vi } from "vitest"

import { getOrCreateHouseholdForTelegramUser } from "@/lib/auth/household"
import { createSupabaseAdmin } from "@/lib/supabase/server"

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: vi.fn(),
}))

const createSupabaseAdminMock = vi.mocked(createSupabaseAdmin)

describe("getOrCreateHouseholdForTelegramUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns an existing household when the Telegram user is already linked", async () => {
    const lookupBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { household_id: "existing-household" },
        error: null,
      }),
    }

    createSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue(lookupBuilder),
    } as never)

    await expect(
      getOrCreateHouseholdForTelegramUser("123417640", "Ivan"),
    ).resolves.toEqual({
      ok: true,
      householdId: "existing-household",
      source: "existing_profile",
    })
  })

  it("returns the lookup error instead of swallowing it", async () => {
    const lookupBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST301",
          message: "JWT expired",
        },
      }),
    }

    createSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue(lookupBuilder),
    } as never)

    await expect(
      getOrCreateHouseholdForTelegramUser("123417640", "Ivan"),
    ).resolves.toEqual({
      ok: false,
      stage: "lookup_profile",
      error: "JWT expired",
      code: "PGRST301",
    })
  })

  it("creates a new household and profile for a first-time Telegram user", async () => {
    const lookupBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }
    const householdInsertBuilder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "new-household" },
        error: null,
      }),
    }
    const profileInsertBuilder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "new-profile" },
        error: null,
      }),
    }

    createSupabaseAdminMock.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(lookupBuilder)
        .mockReturnValueOnce(householdInsertBuilder)
        .mockReturnValueOnce(profileInsertBuilder),
    } as never)

    await expect(
      getOrCreateHouseholdForTelegramUser("123417640", "Ivan Yeo"),
    ).resolves.toEqual({
      ok: true,
      householdId: "new-household",
      source: "created_profile",
    })

    expect(profileInsertBuilder.insert).toHaveBeenCalledWith({
      household_id: "new-household",
      telegram_user_id: "123417640",
      name: "Ivan Yeo",
      birth_year: 1990,
    })
  })
})
