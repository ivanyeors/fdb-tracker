import type { SupabaseClient } from "@supabase/supabase-js"
import type { StockPrice } from "@/lib/external/fmp"
import type { PreciousMetalPrice } from "@/lib/external/precious-metals"
import { enrichInvestmentsWithLivePrices } from "@/lib/investments/enrich-with-live-prices"
import { getMultipleStockPrices } from "@/lib/external/fmp"
import { getOcbcPreciousMetalPrices } from "@/lib/external/precious-metals"
import { getSgdPerUsd } from "@/lib/external/usd-sgd"

/** Latest ILP fund values per product (optional month ceiling on entries). */
export async function computeIlpFundTotal(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  ilpMonthFilter: string | null = null,
): Promise<number> {
  let ilpQuery = supabase
    .from("ilp_products")
    .select("id")
    .eq("family_id", familyId)
  if (profileId) {
    ilpQuery = ilpQuery.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }
  const { data: ilpProducts } = await ilpQuery
  if (!ilpProducts || ilpProducts.length === 0) return 0

  const productIds = ilpProducts.map((p) => p.id)
  let ilpEntriesQuery = supabase
    .from("ilp_entries")
    .select("product_id, month, fund_value")
    .in("product_id", productIds)
    .order("month", { ascending: false })

  if (ilpMonthFilter) {
    ilpEntriesQuery = ilpEntriesQuery.lte("month", ilpMonthFilter)
  }

  const { data: ilpEntries } = await ilpEntriesQuery
  const latestByProduct = new Map<string, number>()
  if (ilpEntries) {
    for (const e of ilpEntries) {
      if (!latestByProduct.has(e.product_id)) {
        latestByProduct.set(e.product_id, e.fund_value)
      }
    }
  }
  return Array.from(latestByProduct.values()).reduce((s, v) => s + v, 0)
}

export type NetLiquidOptions = {
  stockPrices?: StockPrice[]
  metalsPrices?: PreciousMetalPrice[]
}

/**
 * Brokerage SGD cash + holdings that have a **live** quote (after FX to SGD).
 * Excludes ILP, bonds, book-only rows, and rows with no price.
 */
export async function computeNetLiquidValue(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  options?: NetLiquidOptions,
): Promise<number> {
  let investmentQuery = supabase
    .from("investments")
    .select("symbol, type, units, cost_basis, created_at")
    .eq("family_id", familyId)

  if (profileId) {
    investmentQuery = investmentQuery.or(
      `profile_id.eq.${profileId},profile_id.is.null`,
    )
  }

  const { data: investments } = await investmentQuery
  let holdingsLiveSgd = 0

  if (investments && investments.length > 0) {
    let stockPrices = options?.stockPrices
    let metalsPrices = options?.metalsPrices

    const stockSymbols = [
      ...new Set(
        investments
          .filter((inv) => inv.type === "stock" || inv.type === "etf")
          .map((inv) => inv.symbol),
      ),
    ]
    const hasMetal = investments.some(
      (inv) => inv.type === "gold" || inv.type === "silver",
    )

    if (!stockPrices && stockSymbols.length > 0) {
      stockPrices = await getMultipleStockPrices(stockSymbols)
    }
    if (!metalsPrices && hasMetal) {
      metalsPrices = await getOcbcPreciousMetalPrices()
    }

    const enriched = await enrichInvestmentsWithLivePrices(investments, {
      stockPrices,
      metalsPrices,
    })

    const sgdPerUsd = await getSgdPerUsd()
    for (const row of enriched) {
      if (row.pricingSource !== "live") continue
      const mv = row.marketValue
      if (
        mv != null &&
        Number.isFinite(mv) &&
        mv > 0 &&
        sgdPerUsd != null &&
        sgdPerUsd > 0
      ) {
        holdingsLiveSgd += mv * sgdPerUsd
      }
    }
  }

  let cashSgd = 0
  if (profileId) {
    const { data: accountRow } = await supabase
      .from("investment_accounts")
      .select("cash_balance")
      .eq("family_id", familyId)
      .eq("profile_id", profileId)
      .maybeSingle()
    cashSgd = accountRow?.cash_balance ?? 0
  } else {
    const { data: accounts } = await supabase
      .from("investment_accounts")
      .select("cash_balance")
      .eq("family_id", familyId)
    cashSgd = accounts?.reduce((s, a) => s + (a.cash_balance ?? 0), 0) ?? 0
  }

  return holdingsLiveSgd + cashSgd
}

/** Overview / snapshots: NLV + ILP fund values (reporting currency SGD for cash + live; ILP as stored). */
export async function computeTotalInvestmentsValue(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  ilpMonthFilter: string | null,
  options?: NetLiquidOptions,
): Promise<{ netLiquidValue: number; ilpFundTotal: number; investmentTotal: number }> {
  const [netLiquidValue, ilpFundTotal] = await Promise.all([
    computeNetLiquidValue(supabase, familyId, profileId, options),
    computeIlpFundTotal(supabase, familyId, profileId, ilpMonthFilter),
  ])
  const investmentTotal = netLiquidValue + ilpFundTotal
  return { netLiquidValue, ilpFundTotal, investmentTotal }
}
