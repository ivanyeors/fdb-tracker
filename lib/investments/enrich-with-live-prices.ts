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

export type PricingSource = "live" | "none"

export type LivePriceFields = {
  currentPrice: number | null
  currency: string | null
  marketValue: number | null
  unrealisedPnL: number | null
  unrealisedPnLPct: number | null
  pricingSource: PricingSource
}

export type EnrichInvestmentInput = {
  symbol: string
  type: string
  units: number
  cost_basis: number
}

function noneFields(): Pick<
  LivePriceFields,
  "currentPrice" | "currency" | "marketValue" | "unrealisedPnL" | "unrealisedPnLPct" | "pricingSource"
> {
  return {
    currentPrice: null,
    currency: null,
    marketValue: null,
    unrealisedPnL: null,
    unrealisedPnLPct: null,
    pricingSource: "none",
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

  const stockPricesMap = new Map(
    stockPrices.map((p) => [p.ticker.toUpperCase(), p]),
  )

  const hasStockEtf = investments.some(
    (inv) => inv.type === "stock" || inv.type === "etf",
  )
  const sgdPerUsd = hasStockEtf ? await getSgdPerUsd() : null

  return investments.map((inv) => {
    if (inv.type === "gold" || inv.type === "silver") {
      const metalPrice = metalsPrices.find(
        (m) => m.metalType.toLowerCase() === inv.type.toLowerCase(),
      )
      const sellPrice = metalPrice?.sellPriceSgd
      if (
        sellPrice == null ||
        !Number.isFinite(sellPrice) ||
        sellPrice <= 0
      ) {
        return { ...inv, ...noneFields() }
      }
      const pnl = calculatePnL(inv.units, inv.cost_basis, sellPrice)
      return {
        ...inv,
        currentPrice: sellPrice,
        currency: "SGD",
        pricingSource: "live",
        ...pnl,
      }
    }

    if (inv.type === "bond" || inv.type === "ilp") {
      return { ...inv, ...noneFields() }
    }

    const priceData = stockPricesMap.get(inv.symbol.toUpperCase())
    if (
      !priceData ||
      typeof priceData.price !== "number" ||
      !Number.isFinite(priceData.price) ||
      priceData.price <= 0
    ) {
      return { ...inv, ...noneFields() }
    }

    const quoteCurrency = (priceData.currency ?? "USD").toUpperCase()
    let priceSgd: number
    if (quoteCurrency === "SGD") {
      priceSgd = priceData.price
    } else if (quoteCurrency === "USD") {
      if (sgdPerUsd == null || sgdPerUsd <= 0) {
        return { ...inv, ...noneFields() }
      }
      priceSgd = priceData.price * sgdPerUsd
    } else {
      return { ...inv, ...noneFields() }
    }

    const pnl = calculatePnL(inv.units, inv.cost_basis, priceSgd)
    return {
      ...inv,
      currentPrice: priceSgd,
      currency: "SGD",
      pricingSource: "live",
      ...pnl,
    }
  })
}
