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

async function fetchInvestments(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
): Promise<InvestmentRow[]> {
  let invQuery = supabase
    .from("investments")
    .select("symbol, type, units, cost_basis")
    .eq("family_id", familyId)
  if (profileId) {
    invQuery = invQuery.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }
  const { data } = await invQuery
  return (data ?? []) as InvestmentRow[]
}

async function fetchCashTotal(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
): Promise<number> {
  if (profileId) {
    const { data: accountRow } = await supabase
      .from("investment_accounts")
      .select("cash_balance")
      .eq("family_id", familyId)
      .eq("profile_id", profileId)
      .maybeSingle()
    return accountRow?.cash_balance ?? 0
  }
  const { data: accounts } = await supabase
    .from("investment_accounts")
    .select("cash_balance")
    .eq("family_id", familyId)
  return accounts?.reduce((s, a) => s + (a.cash_balance ?? 0), 0) ?? 0
}

async function fetchIlpEntriesByProduct(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
): Promise<Map<string, IlpEntryRow[]>> {
  let ilpQuery = supabase
    .from("ilp_products")
    .select("id")
    .eq("family_id", familyId)
  if (profileId) {
    ilpQuery = ilpQuery.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }
  const { data: ilpProducts } = await ilpQuery
  const byProduct = new Map<string, IlpEntryRow[]>()
  if (!ilpProducts || ilpProducts.length === 0) return byProduct

  const productIds = ilpProducts.map((p) => p.id)
  const { data: allEntries } = await supabase
    .from("ilp_entries")
    .select("product_id, month, fund_value")
    .in("product_id", productIds)
    .order("month", { ascending: true })
  if (!allEntries) return byProduct

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
  return byProduct
}

type PriceContext = {
  stockPricesByTicker: Map<string, Map<string, number>>
  metalPricesByType: Map<string, Map<string, number>>
  currencyBySymbol: Map<string, string>
  currentMetalMap: Map<string, number>
  sgdPerUsd: number | null
}

async function fetchPriceContext(
  investments: InvestmentRow[],
  startStr: string,
  endStr: string,
): Promise<PriceContext> {
  const stockSymbols = [
    ...new Set(
      investments
        .filter((i) => i.type === "stock" || i.type === "etf")
        .map((i) => i.symbol),
    ),
  ]
  const hasMetals = investments.some(
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
      : Promise.resolve(new Map<string, Map<string, number>>()),
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
  return {
    stockPricesByTicker,
    metalPricesByType,
    currencyBySymbol,
    currentMetalMap,
    sgdPerUsd,
  }
}

function priceToSgd(
  raw: number,
  currency: string,
  sgdPerUsd: number | null,
): number {
  if (raw <= 0) return 0
  if (currency === "SGD") return raw
  if (currency === "USD") {
    if (sgdPerUsd == null || sgdPerUsd <= 0) return 0
    return raw * sgdPerUsd
  }
  return 0
}

function valueStockOnDate(
  inv: InvestmentRow,
  dateStr: string,
  ctx: PriceContext,
  lastStockPrice: Map<string, number>,
): number {
  const sym = inv.symbol.toUpperCase()
  const byDate = ctx.stockPricesByTicker.get(sym)
  const raw = byDate?.get(dateStr) ?? lastStockPrice.get(sym) ?? 0
  if (raw > 0) lastStockPrice.set(sym, raw)
  const currency = ctx.currencyBySymbol.get(sym) ?? "USD"
  const priceSgd = priceToSgd(raw, currency, ctx.sgdPerUsd)
  return priceSgd > 0 ? inv.units * priceSgd : 0
}

function valueMetalOnDate(
  inv: InvestmentRow,
  dateStr: string,
  ctx: PriceContext,
  lastMetalPrice: Map<string, number>,
): number {
  const byDate = ctx.metalPricesByType.get(inv.type)
  const current = ctx.currentMetalMap.get(inv.type.toLowerCase()) ?? 0
  const price =
    byDate?.get(dateStr) ?? lastMetalPrice.get(inv.type) ?? current
  if (price > 0) lastMetalPrice.set(inv.type, price)
  return price > 0 ? inv.units * price : 0
}

function marketValueOnDate(
  investments: InvestmentRow[],
  dateStr: string,
  ctx: PriceContext,
  lastStockPrice: Map<string, number>,
  lastMetalPrice: Map<string, number>,
): number {
  let total = 0
  for (const inv of investments) {
    if (inv.type === "stock" || inv.type === "etf") {
      total += valueStockOnDate(inv, dateStr, ctx, lastStockPrice)
    } else if (inv.type === "gold" || inv.type === "silver") {
      total += valueMetalOnDate(inv, dateStr, ctx, lastMetalPrice)
    }
  }
  return total
}

async function backfillHistory(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  startStr: string,
  endStr: string,
): Promise<{ date: string; value: number }[]> {
  const investments = await fetchInvestments(supabase, familyId, profileId)
  if (investments.length === 0) return []

  const [priceCtx, cashTotal, byProduct] = await Promise.all([
    fetchPriceContext(investments, startStr, endStr),
    fetchCashTotal(supabase, familyId, profileId),
    fetchIlpEntriesByProduct(supabase, familyId, profileId),
  ])

  const dates = dateRange(startStr, endStr)
  const result: { date: string; value: number }[] = []
  const lastStockPrice = new Map<string, number>()
  const lastMetalPrice = new Map<string, number>()

  for (const dateStr of dates) {
    const ym = dateStr.slice(0, 7)
    const marketSgd = marketValueOnDate(
      investments,
      dateStr,
      priceCtx,
      lastStockPrice,
      lastMetalPrice,
    )
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

  // Combined view (profileId null): fetch per-profile snapshots and sum by date.
  // The cron writes a profile_id IS NULL aggregate row, but only for "today" — historical
  // dates may be missing the aggregate, so we always derive the family total from per-profile rows.
  let snapshotRows: Array<{ date: string; total_value: number }> = []
  if (profileId) {
    const { data } = await supabase
      .from("investment_snapshots")
      .select("date, total_value")
      .eq("family_id", familyId)
      .eq("profile_id", profileId)
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date", { ascending: true })
    snapshotRows = data ?? []
  } else {
    const { data: familyProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("family_id", familyId)
    const profileIds = (familyProfiles ?? []).map((p) => p.id as string)
    if (profileIds.length > 0) {
      const { data: perProfile } = await supabase
        .from("investment_snapshots")
        .select("date, total_value, profile_id")
        .eq("family_id", familyId)
        .in("profile_id", profileIds)
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true })
      const sumByDate = new Map<string, number>()
      for (const r of perProfile ?? []) {
        sumByDate.set(r.date, (sumByDate.get(r.date) ?? 0) + (r.total_value ?? 0))
      }
      snapshotRows = Array.from(sumByDate.entries())
        .map(([date, total_value]) => ({ date, total_value }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  const todayStr = endDate.toISOString().slice(0, 10)
  const hasTodaySnapshot = snapshotRows.some((s) => s.date === todayStr)

  let data: { date: string; value: number }[] = snapshotRows.map((s) => ({
    date: s.date,
    value: Math.round(s.total_value * 100) / 100,
  }))

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
