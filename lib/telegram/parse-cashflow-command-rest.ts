/**
 * Optional one-line mode: `/in 15000 salary credit` or `/out 3200 groceries`.
 * Multi-profile: `/in John 15000 salary` (profile name first, then amount, then memo).
 */

export type ParsedCashflowOneLine = {
  profileId: string
  profileName: string
  amount: number
  memo?: string
}

const AMOUNT_MEMO = /^\s*([0-9]+(?:\.[0-9]+)?)\s*([\s\S]*)$/

export function parseAmountAndMemoFromRest(
  rest: string,
): { amount: number; memo?: string } | null {
  const trimmed = rest.trim()
  if (!trimmed) return null
  const m = trimmed.match(AMOUNT_MEMO)
  if (!m) return null
  const amount = Number.parseFloat(m[1])
  if (Number.isNaN(amount) || amount <= 0) return null
  const memoRaw = (m[2] ?? "").trim()
  const memo = memoRaw.length > 0 ? memoRaw.slice(0, 2000) : undefined
  return { amount, memo }
}

export function parseCashflowOneLine(
  rest: string,
  profiles: Array<{ id: string; name: string }>,
): ParsedCashflowOneLine | null {
  const trimmed = rest.trim()
  if (!trimmed || profiles.length === 0) return null

  const sorted = [...profiles].sort((a, b) => b.name.length - a.name.length)

  for (const p of sorted) {
    const nt = p.name.trim()
    if (!nt) continue
    const prefix = `${nt} `
    if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) continue
    const after = trimmed.slice(prefix.length)
    const parsed = parseAmountAndMemoFromRest(after)
    if (parsed) {
      return {
        profileId: p.id,
        profileName: p.name,
        amount: parsed.amount,
        memo: parsed.memo,
      }
    }
  }

  if (profiles.length === 1) {
    const parsed = parseAmountAndMemoFromRest(trimmed)
    if (parsed) {
      return {
        profileId: profiles[0].id,
        profileName: profiles[0].name,
        amount: parsed.amount,
        memo: parsed.memo,
      }
    }
  }

  return null
}
