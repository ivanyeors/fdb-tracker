import { beforeEach, describe, expect, it, vi } from "vitest"

import { getOrCreateHouseholdForChannel } from "@/lib/auth/household"
import { createSupabaseAdmin } from "@/lib/supabase/server"

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: vi.fn(),
}))

const createSupabaseAdminMock = vi.mocked(createSupabaseAdmin)

describe("getOrCreateHouseholdForChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns an existing household when the chat is already linked", async () => {
    const lookupBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "existing-household" },
        error: null,
      }),
    }

    createSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue(lookupBuilder),
    } as never)

    await expect(
      getOrCreateHouseholdForChannel("123417640"),
    ).resolves.toEqual({
      ok: true,
      householdId: "existing-household",
      source: "existing",
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
      getOrCreateHouseholdForChannel("123417640"),
    ).resolves.toEqual({
      ok: false,
      stage: "lookup",
      error: "JWT expired",
      code: "PGRST301",
    })
  })

  it("returns the create error when a new household cannot be inserted", async () => {
    const lookupBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }
    const insertBuilder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "23502",
          message: "null value in column violates constraint",
        },
      }),
    }

    createSupabaseAdminMock.mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(lookupBuilder)
        .mockReturnValueOnce(insertBuilder),
    } as never)

    await expect(
      getOrCreateHouseholdForChannel("123417640"),
    ).resolves.toEqual({
      ok: false,
      stage: "create",
      error: "null value in column violates constraint",
      code: "23502",
    })
  })
})
