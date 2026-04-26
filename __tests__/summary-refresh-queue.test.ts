import { beforeEach, describe, expect, it, vi } from "vitest"

import { drainSummaryRefreshQueue } from "@/lib/repos/summary-refresh-queue"
import { refreshOneSummaryScope } from "@/lib/repos/monthly-transaction-summary"

vi.mock("@/lib/repos/monthly-transaction-summary", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/repos/monthly-transaction-summary")
  >("@/lib/repos/monthly-transaction-summary")
  return {
    ...actual,
    refreshOneSummaryScope: vi.fn(),
  }
})

const refreshMock = vi.mocked(refreshOneSummaryScope)

interface QueueRow {
  profile_id: string
  family_id: string
  month: string
  statement_type: "bank" | "cc"
  enqueued_at: string
  claimed_at: string | null
}

/**
 * Builds a mock supabase client whose `from("summary_refresh_queue")` chain
 * returns scripted responses for the four call shapes the drainer uses:
 *   1. update({claimed_at:null}, {count}).lt(...)        — stale sweep
 *   2. select(...).is(...).limit(N)[.or(...)]            — fetch pending
 *   3. update({claimed_at:now}).eq×3.is(...).select()    — atomic claim
 *   4. delete().eq×4                                     — finalize
 */
function buildSupabaseMock(initialPending: QueueRow[]) {
  // Mutable state: rows the drainer can claim/delete.
  const queue: QueueRow[] = [...initialPending]

  const deletedKeys: string[] = []
  const claimedKeys: string[] = []

  function rowKey(r: { profile_id: string; month: string; statement_type: string }) {
    return `${r.profile_id}|${r.month}|${r.statement_type}`
  }

  function makeQueueChain() {
    let mode: "select" | "claim" | "delete" | "stale" | null = null
    const selectFilters: { profile_id?: string; month?: string; statement_type?: string; enqueued_at?: string } = {}

    const chain: Record<string, (...args: unknown[]) => unknown> = {}

    chain.select = () => {
      mode = "select"
      return chain
    }
    chain.update = (_patch: unknown, _opts?: unknown) => {
      // The first update we see in a drainer pass is the stale sweep
      // (followed by .lt). The per-row claims come later (followed by
      // .eq×3.is(...).select()).
      mode = "stale"
      return chain
    }
    chain.delete = () => {
      mode = "delete"
      return chain
    }
    chain.lt = () => {
      // stale sweep terminator → returns count
      return Promise.resolve({ count: 0, error: null })
    }
    chain.is = () => chain
    chain.limit = () => {
      // select pending terminator
      const pending = queue
        .filter((r) => r.claimed_at === null)
        .filter((r) => {
          if (!selectFilters.profile_id) return true
          return (
            r.profile_id === selectFilters.profile_id &&
            r.month === selectFilters.month &&
            r.statement_type === selectFilters.statement_type
          )
        })
      return Promise.resolve({ data: pending.slice(), error: null })
    }
    chain.or = () => chain
    chain.eq = (col: string, val: string) => {
      if (mode === "select") selectFilters[col as keyof typeof selectFilters] = val
      if (mode === "claim" || mode === "delete") {
        selectFilters[col as keyof typeof selectFilters] = val
      }
      return chain
    }

    // The claim path: .update({claimed_at:now}).eq×3.is("claimed_at", null).select()
    // We disambiguate "claim" vs "stale" by detecting .eq() coming before .lt().
    // Once .eq() is called after .update(), we're in claim mode.
    const wrappedEq = chain.eq
    chain.eq = (col: string, val: string) => {
      if (mode === "stale") mode = "claim"
      return wrappedEq(col, val)
    }

    // For claim path, .select() at the end terminates with the claimed row.
    const originalSelect = chain.select
    chain.select = () => {
      if (mode === "claim") {
        // Atomic claim: only the matching row that is still un-claimed.
        const target = queue.find(
          (r) =>
            r.claimed_at === null &&
            r.profile_id === selectFilters.profile_id &&
            r.month === selectFilters.month &&
            r.statement_type === selectFilters.statement_type,
        )
        if (target) {
          target.claimed_at = new Date().toISOString()
          claimedKeys.push(rowKey(target))
          return Promise.resolve({ data: [target], error: null })
        }
        return Promise.resolve({ data: [], error: null })
      }
      return originalSelect()
    }

    // For delete path: .eq×4 (final eq is enqueued_at).
    // The last .eq() in a delete chain finalizes the call.
    // We override eq again to detect "delete-finalize" via the
    // accumulated filters having profile_id, month, statement_type, enqueued_at.
    const wrappedEq2 = chain.eq
    chain.eq = (col: string, val: string) => {
      const result = wrappedEq2(col, val) as Record<string, unknown>
      if (
        mode === "delete" &&
        selectFilters.profile_id &&
        selectFilters.month &&
        selectFilters.statement_type &&
        selectFilters.enqueued_at
      ) {
        // Final filter applied → execute the delete and return promise-like.
        const idx = queue.findIndex(
          (r) =>
            r.profile_id === selectFilters.profile_id &&
            r.month === selectFilters.month &&
            r.statement_type === selectFilters.statement_type &&
            r.enqueued_at === selectFilters.enqueued_at,
        )
        if (idx >= 0) {
          deletedKeys.push(rowKey(queue[idx]))
          queue.splice(idx, 1)
        }
        return Object.assign(
          Promise.resolve({ error: null }) as unknown as Record<
            string,
            unknown
          >,
          result,
        )
      }
      return result
    }

    return chain
  }

  const from = vi.fn((table: string) => {
    if (table !== "summary_refresh_queue") {
      throw new Error(`unexpected table: ${table}`)
    }
    return makeQueueChain()
  })

  return {
    client: { from } as unknown as Parameters<typeof drainSummaryRefreshQueue>[0],
    queue,
    deletedKeys,
    claimedKeys,
  }
}

describe("drainSummaryRefreshQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns zeros when the queue is empty", async () => {
    const mock = buildSupabaseMock([])
    const result = await drainSummaryRefreshQueue(mock.client)

    expect(result).toEqual({ processed: 0, failed: 0, staleReset: 0 })
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it("processes pending rows and deletes them on success", async () => {
    const row: QueueRow = {
      profile_id: "11111111-1111-1111-1111-111111111111",
      family_id: "22222222-2222-2222-2222-222222222222",
      month: "2026-04-01",
      statement_type: "bank",
      enqueued_at: "2026-04-25T10:00:00Z",
      claimed_at: null,
    }
    const mock = buildSupabaseMock([row])
    refreshMock.mockResolvedValue(undefined)

    const result = await drainSummaryRefreshQueue(mock.client)

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
    expect(refreshMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profile_id: row.profile_id,
        month: row.month,
        statement_type: "bank",
      }),
    )
    expect(mock.queue).toHaveLength(0)
    expect(mock.deletedKeys).toContain(
      `${row.profile_id}|${row.month}|${row.statement_type}`,
    )
  })

  it("does not delete a row when refreshOneSummaryScope throws", async () => {
    const row: QueueRow = {
      profile_id: "11111111-1111-1111-1111-111111111111",
      family_id: "22222222-2222-2222-2222-222222222222",
      month: "2026-04-01",
      statement_type: "cc",
      enqueued_at: "2026-04-25T10:00:00Z",
      claimed_at: null,
    }
    const mock = buildSupabaseMock([row])
    refreshMock.mockRejectedValue(new Error("simulated supabase blip"))

    const result = await drainSummaryRefreshQueue(mock.client)

    expect(result.processed).toBe(0)
    expect(result.failed).toBe(1)
    expect(mock.queue).toHaveLength(1)
    expect(mock.queue[0].claimed_at).not.toBeNull()
    expect(mock.deletedKeys).toHaveLength(0)
  })
})
