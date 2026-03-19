import type { SupabaseClient } from "@supabase/supabase-js"
import { getMultipleStockPrices } from "@/lib/external/fmp"
import { getOcbcPreciousMetalPrices } from "@/lib/external/precious-metals"

export async function computeInvestmentTotal(
  supabase: SupabaseClient,
  familyId: string,
  profileId: string | null,
  options?: {
    stockPrices?: { ticker: string; price: number }[]
    metalsPrices?: { metalType: string; sellPriceSgd: number }[]
    ilpMonthFilter?: string | null
  },
): Promise<number> {
  let investmentQuery = supabase
    .from("investments")
    .select("symbol, type, units, cost_basis")
    .eq("family_id", familyId)

  if (profileId) {
    investmentQuery = investmentQuery.eq("profile_id", profileId)
  }

  const { data: investments } = await investmentQuery
  let holdingsTotal = 0

  if (investments && investments.length > 0) {
    const stockSymbols = [
      ...new Set(
        investments
          .filter((inv) => inv.type === "stock" || inv.type === "etf")
          .map((inv) => inv.symbol),
      ),
    ]
    const metalTypes = investments.filter(
      (inv) => inv.type === "gold" || inv.type === "silver",
    )

    let stockPrices = options?.stockPrices ?? []
    let metalsPrices = options?.metalsPrices ?? []

    if (stockPrices.length === 0 && stockSymbols.length > 0) {
      const prices = await getMultipleStockPrices(stockSymbols)
      stockPrices = prices.map((p) => ({ ticker: p.ticker, price: p.price }))
    }
    if (metalsPrices.length === 0 && metalTypes.length > 0) {
      const prices = await getOcbcPreciousMetalPrices()
      metalsPrices = prices.map((p) => ({
        metalType: p.metalType,
        sellPriceSgd: p.sellPriceSgd,
      }))
    }

    for (const inv of investments) {
      if (inv.type === "stock" || inv.type === "etf") {
        const priceData = stockPrices.find(
          (p) => p.ticker.toUpperCase() === inv.symbol.toUpperCase(),
        )
        const price = priceData?.price ?? 0
        holdingsTotal +=
          price > 0 ? inv.units * price : inv.units * inv.cost_basis
      } else if (inv.type === "gold" || inv.type === "silver") {
        const metalPrice = metalsPrices.find(
          (m) => m.metalType.toLowerCase() === inv.type.toLowerCase(),
        )
        const sellPrice = metalPrice?.sellPriceSgd ?? 0
        holdingsTotal +=
          sellPrice > 0 ? inv.units * sellPrice : inv.units * inv.cost_basis
      } else {
        holdingsTotal += inv.units * inv.cost_basis
      }
    }
  }

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
    cashTotal = accounts?.reduce((s, a) => s + (a.cash_balance ?? 0), 0) ?? 0
  }

  let ilpQuery = supabase
    .from("ilp_products")
    .select("id")
    .eq("family_id", familyId)
  if (profileId) {
    ilpQuery = ilpQuery.or(`profile_id.eq.${profileId},profile_id.is.null`)
  }
  const { data: ilpProducts } = await ilpQuery
  let ilpTotal = 0
  if (ilpProducts && ilpProducts.length > 0) {
    const productIds = ilpProducts.map((p) => p.id)
    let ilpEntriesQuery = supabase
      .from("ilp_entries")
      .select("product_id, month, fund_value")
      .in("product_id", productIds)
      .order("month", { ascending: false })
    if (options?.ilpMonthFilter) {
      ilpEntriesQuery = ilpEntriesQuery.lte("month", options.ilpMonthFilter)
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
    ilpTotal = Array.from(latestByProduct.values()).reduce((s, v) => s + v, 0)
  }

  return holdingsTotal + cashTotal + ilpTotal
}
