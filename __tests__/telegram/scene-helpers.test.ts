import { describe, expect, it, vi } from "vitest"

import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  buildMonthPicker,
  parseMonthCallback,
  errorMsg,
  fmtAmt,
  buildQuickAmountKeyboard,
  cancelMiddleware,
} from "@/lib/telegram/scene-helpers"
import type { MyContext } from "@/lib/telegram/bot"

describe("progressHeader", () => {
  it("formats step indicator with context", () => {
    expect(progressHeader(2, 4, "Recording inflow for John")).toBe(
      "[2/4] Recording inflow for John",
    )
  })

  it("handles step 1 of 1", () => {
    expect(progressHeader(1, 1, "Done")).toBe("[1/1] Done")
  })
})

describe("buildConfirmationMessage", () => {
  it("builds a formatted message with title and fields", () => {
    const msg = buildConfirmationMessage("Confirm Inflow", [
      { label: "Profile", value: "John" },
      { label: "Amount", value: "$5,000.00" },
    ])
    expect(msg).toContain("--- Confirm Inflow ---")
    expect(msg).toContain("Profile: John")
    expect(msg).toContain("Amount: $5,000.00")
    expect(msg).toContain("Tap ✅ Confirm to save")
  })
})

describe("buildConfirmationKeyboard", () => {
  it("includes confirm and cancel buttons in first row", () => {
    const keyboard = buildConfirmationKeyboard([
      { label: "Amount", callbackData: "ed_amt" },
    ])
    expect(keyboard.inline_keyboard[0]).toEqual([
      { text: "✅ Confirm", callback_data: "cf" },
      { text: "❌ Cancel", callback_data: "cn" },
    ])
  })

  it("includes edit buttons in subsequent rows", () => {
    const keyboard = buildConfirmationKeyboard([
      { label: "Amount", callbackData: "ed_amt" },
      { label: "Month", callbackData: "ed_month" },
      { label: "Memo", callbackData: "ed_memo" },
    ])
    // First edit row has 2 buttons
    expect(keyboard.inline_keyboard[1]).toHaveLength(2)
    expect(keyboard.inline_keyboard[1][0].text).toBe("Edit Amount")
    expect(keyboard.inline_keyboard[1][1].text).toBe("Edit Month")
    // Second edit row has 1 button
    expect(keyboard.inline_keyboard[2]).toHaveLength(1)
    expect(keyboard.inline_keyboard[2][0].text).toBe("Edit Memo")
  })
})

describe("buildMonthPicker", () => {
  it("returns 6 month buttons in 2 rows of 3", () => {
    const picker = buildMonthPicker()
    expect(picker.inline_keyboard).toHaveLength(2)
    expect(picker.inline_keyboard[0]).toHaveLength(3)
    expect(picker.inline_keyboard[1]).toHaveLength(3)
  })

  it("buttons have m_ prefix callback data", () => {
    const picker = buildMonthPicker()
    const firstButton = picker.inline_keyboard[0][0]
    expect(firstButton.callback_data).toMatch(/^m_\d{4}-\d{2}-\d{2}$/)
  })
})

describe("parseMonthCallback", () => {
  it("parses valid month callback", () => {
    const result = parseMonthCallback("m_2026-03-01")
    expect(result).not.toBeNull()
    expect(result!.month).toBe("2026-03-01")
    expect(result!.monthLabel).toBe("March 2026")
  })

  it("returns null for invalid callback", () => {
    expect(parseMonthCallback("invalid")).toBeNull()
    expect(parseMonthCallback("m_bad-date")).toBeNull()
  })

  it("returns null for non-month prefix", () => {
    expect(parseMonthCallback("profile_123")).toBeNull()
  })
})

describe("errorMsg", () => {
  it("formats error with hint only", () => {
    const msg = errorMsg("Invalid amount.")
    expect(msg).toBe("❌ Invalid amount.")
  })

  it("formats error with hint and example", () => {
    const msg = errorMsg("Invalid amount.", "5000")
    expect(msg).toBe("❌ Invalid amount.\nExample: 5000")
  })
})

describe("fmtAmt", () => {
  it("formats with dollar sign and commas", () => {
    expect(fmtAmt(1500)).toBe("$1,500.00")
  })

  it("formats small amounts", () => {
    expect(fmtAmt(0.5)).toBe("$0.50")
  })

  it("formats zero", () => {
    expect(fmtAmt(0)).toBe("$0.00")
  })
})

describe("buildQuickAmountKeyboard", () => {
  it("builds a single row of amount buttons", () => {
    const keyboard = buildQuickAmountKeyboard([100, 500, 1000])
    expect(keyboard.inline_keyboard).toHaveLength(1)
    expect(keyboard.inline_keyboard[0]).toHaveLength(3)
    expect(keyboard.inline_keyboard[0][0]).toEqual({
      text: "$100.00",
      callback_data: "qa_100",
    })
  })

  it("supports custom prefix", () => {
    const keyboard = buildQuickAmountKeyboard([500], "amt")
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe("amt_500")
  })
})

describe("cancelMiddleware", () => {
  function makeCtx(text: string, hasActiveScene = true) {
    const leave = vi.fn(async () => undefined)
    const reply = vi.fn(async () => undefined)
    const ctx = {
      message: { text },
      scene: {
        current: hasActiveScene ? { id: "fake_wizard" } : null,
        leave,
      },
      reply,
    } as unknown as MyContext
    return { ctx, leave, reply }
  }

  it("ejects active scene and replies on /cancel", async () => {
    const next = vi.fn(async () => undefined)
    const { ctx, leave, reply } = makeCtx("/cancel")
    await cancelMiddleware(ctx, next)
    expect(leave).toHaveBeenCalledOnce()
    expect(reply).toHaveBeenCalledWith("Cancelled.")
    expect(next).not.toHaveBeenCalled()
  })

  it("ejects active scene for /start and falls through", async () => {
    const next = vi.fn(async () => undefined)
    const { ctx, leave, reply } = makeCtx("/start")
    await cancelMiddleware(ctx, next)
    expect(leave).toHaveBeenCalledOnce()
    expect(reply).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })

  it("ejects active scene for /signup and falls through", async () => {
    const next = vi.fn(async () => undefined)
    const { ctx, leave } = makeCtx("/signup ABC123")
    await cancelMiddleware(ctx, next)
    expect(leave).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
  })

  it("strips bot suffix on commands like /start@MyBot", async () => {
    const next = vi.fn(async () => undefined)
    const { ctx, leave } = makeCtx("/start@MyBot signup_ABC")
    await cancelMiddleware(ctx, next)
    expect(leave).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
  })

  it("does not eject scene for normal text input", async () => {
    const next = vi.fn(async () => undefined)
    const { ctx, leave } = makeCtx("100")
    await cancelMiddleware(ctx, next)
    expect(leave).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })

  it("does not eject scene for non-breaking commands", async () => {
    const next = vi.fn(async () => undefined)
    const { ctx, leave } = makeCtx("/in 500 lunch")
    await cancelMiddleware(ctx, next)
    expect(leave).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })

  it("does not call leave when no scene is active", async () => {
    const next = vi.fn(async () => undefined)
    const { ctx, leave, reply } = makeCtx("/start", false)
    await cancelMiddleware(ctx, next)
    expect(leave).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})
