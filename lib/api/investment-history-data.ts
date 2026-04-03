import type { SupabaseClient } from "@supabase/supabase-js"
import { computeTotalInvestmentsValue } from "@/lib/api/net-liquid"
import {
  getHistoricalPricesBatch,
  getMultipleStockPrices,
} from "@/lib/external/fmp"
import {
  getHistoricalMetalPrices,
  getOcbcPreciousMetalPrices,
} from "@/lib/external/precious-metals"
import { getSgdPerUsd } from "@/lib/external/usd-sgd"

/** Generate YYYY-MM-DD dates from start to end (inclusive). */
function dateRange(startStr: string, endStr: string): string[] {
  const out: string[] = []
  const start = new Date(startStr + "T12:00:00")
  const end = new Date(endStr + "T12:00:00")
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

type InvestmentRow = {
  symbol: string
  type: string
  units: number
  cost_basis: number
}

type IlpEntryRow = {
  product_id: string
  month: string
  fund_value: number
}

function ilpTotalForYearMonth(
  byProduct: Map<string, IlpEntryRow[]>,
  ym: string,
): number {
  let sum = 0
  for (const list of byProduct.values()) {
    let v = 0
    for (const e of list) {
      if (e.month.slice(0, 7) <= ym) v = e.fund_value
      else break
    }
    sum += v
  }
  return sum
}

async function backfillHistory(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  startStr: string,
  endStr: string,
): Promise<{ date: string; value: number }[]> {
  let invQuery = supabase
    .from("investments")
    .select("symbol, type, units, cost_basis")
    .eq("family_id", familyId)
  if (profileId) {
    invQuery = invQuery.or(
      `profile_id.eq.${profileId},profile_id.is.null`,
    )
  }
  const { data: investments } = await invQuery
  if (!investments || investments.length === 0) return []

  const stockSymbols = [
    ...new Set(
      (investments as InvestmentRow[])
        .filter((i) => i.type === "stock" || i.type === "etf")
        .map((i) => i.symbol),
    ),
  ]
  const hasMetals = (investments as InvestmentRow[]).some(
    (i) => i.type === "gold" || i.type === "silver",
  )

  const [
    stockPricesByTicker,
    metalPricesByType,
    currentMetals,
    liveQuotes,
    sgdPerUsd,
  ] = await Promise.all([
    stockSymbols.length > 0
      ? getHistoricalPricesBatch(stockSymbols, startStr, endStr)
      : Promise.resolve(new Map<string, Map<string, number>>()),
    hasMetals
      ? getHistoricalMetalPrices(startStr, endStr)
      : Promise.resolve(new Map()),
    hasMetals ? getOcbcPreciousMetalPrices() : Promise.resolve([]),
    stockSymbols.length > 0
      ? getMultipleStockPrices(stockSymbols)
      : Promise.resolve([]),
    getSgdPerUsd(),
  ])

  const currencyBySymbol = new Map(
    liveQuotes.map((q) => [
      q.ticker.toUpperCase(),
      (q.currency ?? "USD").toUpperCase(),
    ]),
  )

  const currentMetalMap = new Map(
    currentMetals.map((m) => [m.metalType.toLowerCase(), m.sellPriceSgd]),
  )

  let cashTotal = 0
  if (profileId) {
    const { data: accountRow } = await supabase
      .from("investment_accounts")
      .select("cash_balance")
      .eq("family_id", familyId)
      .eq("profile_id", profileId)
      .maybeSingle()
    cashTotal = accountRow?.cash_balance ?? 0
  } else {
    const { data: accounts } = await supabase
      .from("investment_accounts")
      .select("cash_balance")
      .eq("family_id", familyId)
    cashTotal =
      accounts?.reduce((s, a) => s + (a.cash_balance ?? 0), 0) ?? 0
  }

  let ilpQuery = supabase
    .from("ilp_products")
    .select("id")
    .eq("family_id", familyId)
  if (profileId) {
    ilpQuery = ilpQuery.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }
  const { data: ilpProducts } = await ilpQuery

  const byProduct = new Map<string, IlpEntryRow[]>()
  if (ilpProducts && ilpProducts.length > 0) {
    const productIds = ilpProducts.map((p) => p.id)
    const { data: allEntries } = await supabase
      .from("ilp_entries")
      .select("product_id, month, fund_value")
      .in("product_id", productIds)
      .order("month", { ascending: true })

    if (allEntries) {
      for (const e of allEntries) {
        const list = byProduct.get(e.product_id) ?? []
        list.push({
          product_id: e.product_id,
          month: e.month,
          fund_value: e.fund_value,
        })
        byProduct.set(e.product_id, list)
      }
      for (const list of byProduct.values()) {
        list.sort((a, b) => a.month.localeCompare(b.month))
      }
    }
  }

  const dates = dateRange(startStr, endStr)
  const result: { date: string; value: number }[] = []
  const lastStockPrice = new Map<string, number>()
  const lastMetalPrice = new Map<string, number>()

  for (const dateStr of dates) {
    const ym = dateStr.slice(0, 7)
    let marketSgd = 0

    for (const inv of investments as InvestmentRow[]) {
      if (inv.type === "stock" || inv.type === "etf") {
        const sym = inv.symbol.toUpperCase()
        const byDate = stockPricesByTicker.get(sym)
        const raw =
          byDate?.get(dateStr) ?? lastStockPrice.get(sym) ?? 0
        if (raw > 0) lastStockPrice.set(sym, raw)
        const curr = currencyBySymbol.get(sym) ?? "USD"
        let priceSgd = raw
        if (raw > 0) {
          if (curr === "USD") {
            if (sgdPerUsd == null || sgdPerUsd <= 0) priceSgd = 0
            else priceSgd = raw * sgdPerUsd
          } else if (curr !== "SGD") {
            priceSgd = 0
          }
          if (priceSgd > 0) marketSgd += inv.units * priceSgd
        }
      } else if (inv.type === "gold" || inv.type === "silver") {
        const byDate = metalPricesByType.get(
          inv.type as "gold" | "silver",
        )
        const current =
          currentMetalMap.get(inv.type.toLowerCase()) ?? 0
        const price =
          byDate?.get(dateStr) ??
          lastMetalPrice.get(inv.type) ??
          current
        if (price > 0) lastMetalPrice.set(inv.type, price)
        if (price > 0) marketSgd += inv.units * price
      }
    }

    const ilpTotal = ilpTotalForYearMonth(byProduct, ym)
    const total = cashTotal + marketSgd + ilpTotal
    result.push({ date: dateStr, value: Math.round(total * 100) / 100 })
  }

  return result
}

export async function fetchInvestmentHistory(
  supabase: SupabaseClient,
  params: { familyId: string; profileId: string | null; days?: number }
): Promise<{ data: { date: string; value: number }[] }> {
  const { familyId, profileId, days = 30 } = params

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const startStr = startDate.toISOString().slice(0, 10)
  const endStr = endDate.toISOString().slice(0, 10)

  let snapshotsQuery = supabase
    .from("investment_snapshots")
    .select("date, total_value")
    .eq("family_id", familyId)
    .gte("date", startStr)
    .lte("date", endStr)
    .order("date", { ascending: true })

  if (profileId) {
    snapshotsQuery = snapshotsQuery.eq("profile_id", profileId)
  } else {
    snapshotsQuery = snapshotsQuery.is("profile_id", null)
  }

  const { data: snapshots } = await snapshotsQuery

  const todayStr = endDate.toISOString().slice(0, 10)
  const hasTodaySnapshot = snapshots?.some((s) => s.date === todayStr)

  let data: { date: string; value: number }[] =
    snapshots?.map((s) => ({
      date: s.date,
      value: Math.round(s.total_value * 100) / 100,
    })) ?? []

  if (!hasTodaySnapshot) {
    const { investmentTotal: liveTotal } =
      await computeTotalInvestmentsValue(
        supabase,
        familyId,
        profileId,
        null,
      )
    data.push({
      date: todayStr,
      value: Math.round(liveTotal * 100) / 100,
    })
    data.sort((a, b) => a.date.localeCompare(b.date))
  }

  const backfilled = await backfillHistory(
    supabase,
    familyId,
    profileId,
    startStr,
    endStr,
  )
  if (backfilled.length > 0) {
    const merged = new Map(data.map((d) => [d.date, d.value]))
    for (const b of backfilled) {
      merged.set(b.date, b.value)
    }
    data = Array.from(merged.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  return { data }
}
