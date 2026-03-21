import { calculatePnL } from "@/lib/calculations/investments"
import {
  getMultipleStockPrices,
  type StockPrice,
} from "@/lib/external/fmp"
import {
  getOcbcPreciousMetalPrices,
  type PreciousMetalPrice,
} from "@/lib/external/precious-metals"
import { getSgdPerUsd } from "@/lib/external/usd-sgd"
import { tickerLookupVariants } from "@/lib/investments/ticker-lookup"

export type PricingSource = "live" | "none"

export type LivePriceFields = {
  currentPrice: number | null
  currency: string | null
  marketValue: number | null
  unrealisedPnL: number | null
  unrealisedPnLPct: number | null
  pricingSource: PricingSource
  /** Average cost per unit in USD (from DB cost_basis in SGD × FX). */
  cost_basis_usd: number | null
}

export type EnrichInvestmentInput = {
  symbol: string
  type: string
  units: number
  cost_basis: number
}

function buildStockPriceMap(prices: StockPrice[]): Map<string, StockPrice> {
  const map = new Map<string, StockPrice>()
  for (const p of prices) {
    for (const k of tickerLookupVariants(p.ticker)) {
      if (!map.has(k)) map.set(k, p)
    }
  }
  return map
}

function getStockPriceForSymbol(
  map: Map<string, StockPrice>,
  symbol: string,
): StockPrice | undefined {
  for (const k of tickerLookupVariants(symbol)) {
    const p = map.get(k)
    if (
      p &&
      typeof p.price === "number" &&
      Number.isFinite(p.price) &&
      p.price > 0
    ) {
      return p
    }
  }
  return undefined
}

function noneFields(): Pick<
  LivePriceFields,
  | "currentPrice"
  | "currency"
  | "marketValue"
  | "unrealisedPnL"
  | "unrealisedPnLPct"
  | "pricingSource"
  | "cost_basis_usd"
> {
  return {
    currentPrice: null,
    currency: null,
    marketValue: null,
    unrealisedPnL: null,
    unrealisedPnLPct: null,
    pricingSource: "none",
    cost_basis_usd: null,
  }
}

export async function enrichInvestmentsWithLivePrices<
  T extends EnrichInvestmentInput,
>(
  investments: T[],
  options?: {
    stockPrices?: StockPrice[]
    metalsPrices?: PreciousMetalPrice[]
  },
): Promise<Array<T & LivePriceFields>> {
  if (investments.length === 0) return []

  const sgdPerUsd = await getSgdPerUsd()

  const hasMetal = investments.some(
    (inv) => inv.type === "gold" || inv.type === "silver",
  )
  const metalsPrices =
    options?.metalsPrices ??
    (hasMetal ? await getOcbcPreciousMetalPrices() : [])

  const stockSymbols = [
    ...new Set(
      investments
        .filter((inv) => inv.type === "stock" || inv.type === "etf")
        .map((inv) => inv.symbol),
    ),
  ]

  const stockPrices =
    options?.stockPrices ??
    (stockSymbols.length > 0
      ? await getMultipleStockPrices(stockSymbols)
      : [])

  const stockPricesMap = buildStockPriceMap(stockPrices)

  return investments.map((inv) => {
    const costBasisUsd =
      sgdPerUsd != null && sgdPerUsd > 0 ? inv.cost_basis / sgdPerUsd : null

    if (inv.type === "gold" || inv.type === "silver") {
      const metalPrice = metalsPrices.find(
        (m) => m.metalType.toLowerCase() === inv.type.toLowerCase(),
      )
      const sellPriceSgd = metalPrice?.sellPriceSgd
      if (
        sellPriceSgd == null ||
        !Number.isFinite(sellPriceSgd) ||
        sellPriceSgd <= 0 ||
        sgdPerUsd == null ||
        sgdPerUsd <= 0
      ) {
        return { ...inv, ...noneFields(), cost_basis_usd: costBasisUsd }
      }
      const sellPriceUsd = sellPriceSgd / sgdPerUsd
      const costUsdPerUnit = inv.cost_basis / sgdPerUsd
      const pnl = calculatePnL(inv.units, costUsdPerUnit, sellPriceUsd)
      return {
        ...inv,
        currentPrice: sellPriceUsd,
        currency: "USD",
        cost_basis_usd: costBasisUsd,
        pricingSource: "live",
        ...pnl,
      }
    }

    if (inv.type === "bond" || inv.type === "ilp") {
      return { ...inv, ...noneFields(), cost_basis_usd: costBasisUsd }
    }

    const priceData = getStockPriceForSymbol(stockPricesMap, inv.symbol)
    if (
      !priceData ||
      typeof priceData.price !== "number" ||
      !Number.isFinite(priceData.price) ||
      priceData.price <= 0
    ) {
      return { ...inv, ...noneFields(), cost_basis_usd: costBasisUsd }
    }

    if (sgdPerUsd == null || sgdPerUsd <= 0) {
      return { ...inv, ...noneFields(), cost_basis_usd: costBasisUsd }
    }

    const quoteCurrency = (priceData.currency ?? "USD").toUpperCase()
    let priceUsd: number
    if (quoteCurrency === "SGD") {
      priceUsd = priceData.price / sgdPerUsd
    } else if (quoteCurrency === "USD") {
      priceUsd = priceData.price
    } else {
      return { ...inv, ...noneFields(), cost_basis_usd: costBasisUsd }
    }

    const costUsdPerUnit = inv.cost_basis / sgdPerUsd
    const pnl = calculatePnL(inv.units, costUsdPerUnit, priceUsd)
    return {
      ...inv,
      currentPrice: priceUsd,
      currency: "USD",
      cost_basis_usd: costBasisUsd,
      pricingSource: "live",
      ...pnl,
    }
  })
}
