import { beforeEach, describe, expect, it, vi } from "vitest"

import { setBotCommands } from "@/lib/telegram/commands"

describe("setBotCommands", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("registers private and group command menus separately", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({ ok: true }),
      statusText: "OK",
    } as Response)

    await expect(setBotCommands("telegram-token")).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.telegram.org/bottelegram-token/setMyCommands",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          commands: [{ command: "otp", description: "Get OTP for login" }],
          scope: { type: "default" },
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/bottelegram-token/setMyCommands",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          commands: [
            { command: "in", description: "Set monthly inflow" },
            { command: "out", description: "Set monthly outflow" },
            { command: "buy", description: "Record stock buy" },
            { command: "sell", description: "Record stock sell" },
            { command: "stockimg", description: "Attach screenshot to transaction" },
            { command: "ilp", description: "Set ILP fund value" },
            { command: "goaladd", description: "Add to savings goal" },
            { command: "repay", description: "Log loan repayment" },
            { command: "earlyrepay", description: "Log early loan repayment" },
          ],
          scope: { type: "all_group_chats" },
        }),
      }),
    )
  })
})
