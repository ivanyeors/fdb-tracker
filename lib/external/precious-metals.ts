import { metalpriceApiDetail } from "@/lib/external/metalprice-log"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export type PreciousMetalPrice = {
  metalType: string
  buyPriceSgd: number
  sellPriceSgd: number
  unit: string
  timestamp: string
  source?: "live" | "cache"
}

type CacheEntry = {
  data: PreciousMetalPrice[]
  expires: number
}

const CACHE_TTL_MS = 30 * 60 * 1000
let metalsCache: CacheEntry | null = null

function makeFallback(): PreciousMetalPrice[] {
  return []
}

const DB_FALLBACK_TTL_MS = 5 * 60 * 1000

async function fetchFromDb(): Promise<PreciousMetalPrice[]> {
  try {
    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from("precious_metals_prices")
      .select("metal_type, buy_price_sgd, sell_price_sgd, unit, last_updated")

    if (error || !data || data.length === 0) {
      console.warn("[precious-metals] DB fallback returned no data.")
      return []
    }

    return data.map((row) => ({
      metalType: row.metal_type,
      buyPriceSgd: Number(row.buy_price_sgd),
      sellPriceSgd: Number(row.sell_price_sgd),
      unit: row.unit,
      timestamp: row.last_updated,
      source: "cache" as const,
    }))
  } catch (err) {
    console.warn("[precious-metals] DB fallback failed:", err)
    return []
  }
}

/** MetalpriceAPI v1/latest response. See https://metalpriceapi.com/documentation */
type MetalpriceApiRates = {
  /** 1 USD = X oz gold (e.g. 0.00053853) */
  XAU?: number
  /** 1 USD = X oz silver (e.g. 0.03602543) */
  XAG?: number
  /** 1 USD = X SGD (e.g. 1.35) */
  SGD?: number
  /** 1 oz gold = X USD (reciprocal, e.g. 1856.90) */
  USDXAU?: number
  /** 1 oz silver = X USD (reciprocal, e.g. 27.76) */
  USDXAG?: number
}

const METALPRICEAPI_V1 = "https://api.metalpriceapi.com/v1"
const METALPRICEAPI_LATEST = `${METALPRICEAPI_V1}/latest`
const METALPRICEAPI_TIMEFRAME = `${METALPRICEAPI_V1}/timeframe`

export type HistoricalMetalPrice = {
  date: string
  sellPriceSgd: number
}

type TimeframeRates = Record<string, MetalpriceApiRates>

/** MetalpriceAPI timeframe response. Max range 365 days. */
type MetalpriceApiTimeframeResponse = {
  success?: boolean
  rates?: TimeframeRates
}

const historicalMetalsCache = new Map<
  string,
  { data: Map<string, HistoricalMetalPrice[]>; expires: number }
>()
const HISTORICAL_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Fetch historical gold and silver sell prices in SGD for a date range.
 * Uses MetalpriceAPI timeframe endpoint. Only works when METALPRICEAPI_API_KEY is set.
 */
export async function getHistoricalMetalPrices(
  fromDate: string,
  toDate: string,
): Promise<Map<"gold" | "silver", Map<string, number>>> {
  const cacheKey = `${fromDate}:${toDate}`
  const now = Date.now()
  const cached = historicalMetalsCache.get(cacheKey)
  if (cached && cached.expires > now) {
    const result = new Map<"gold" | "silver", Map<string, number>>()
    const goldMap = new Map<string, number>()
    const silverMap = new Map<string, number>()
    for (const p of cached.data.get("gold") ?? []) goldMap.set(p.date, p.sellPriceSgd)
    for (const p of cached.data.get("silver") ?? []) silverMap.set(p.date, p.sellPriceSgd)
    result.set("gold", goldMap)
    result.set("silver", silverMap)
    return result
  }

  const apiKey = process.env.METALPRICEAPI_API_KEY?.trim() ?? ""
  if (!apiKey) {
    return new Map()
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      start_date: fromDate,
      end_date: toDate,
      base: "USD",
      currencies: "XAU,XAG,SGD",
    })
    const url = `${METALPRICEAPI_TIMEFRAME}?${params.toString()}`
    const res = await fetch(url)

    if (!res.ok) {
      console.warn(
        `[precious-metals] MetalpriceAPI timeframe returned ${res.status}.`,
      )
      return new Map()
    }

    const data = (await res.json()) as MetalpriceApiTimeframeResponse
    if (!data.success || !data.rates) {
      return new Map()
    }

    const goldByDate = new Map<string, number>()
    const silverByDate = new Map<string, number>()
    const goldList: HistoricalMetalPrice[] = []
    const silverList: HistoricalMetalPrice[] = []

    for (const [dateStr, r] of Object.entries(data.rates)) {
      const usdPerOzGold =
        typeof r.USDXAU === "number" ? r.USDXAU : typeof r.XAU === "number" ? 1 / r.XAU : 0
      const usdPerOzSilver =
        typeof r.USDXAG === "number" ? r.USDXAG : typeof r.XAG === "number" ? 1 / r.XAG : 0
      const sgdPerUsd = typeof r.SGD === "number" ? r.SGD : 0

      if (usdPerOzGold > 0 && sgdPerUsd > 0) {
        const sellSgd = Math.round(usdPerOzGold * sgdPerUsd * (1 - 0.004) * 100) / 100
        goldByDate.set(dateStr, sellSgd)
        goldList.push({ date: dateStr, sellPriceSgd: sellSgd })
      }
      if (usdPerOzSilver > 0 && sgdPerUsd > 0) {
        const sellSgd = Math.round(usdPerOzSilver * sgdPerUsd * (1 - 0.004) * 100) / 100
        silverByDate.set(dateStr, sellSgd)
        silverList.push({ date: dateStr, sellPriceSgd: sellSgd })
      }
    }

    const cacheData = new Map<string, HistoricalMetalPrice[]>()
    cacheData.set("gold", goldList)
    cacheData.set("silver", silverList)
    historicalMetalsCache.set(cacheKey, {
      data: cacheData,
      expires: now + HISTORICAL_CACHE_TTL_MS,
    })

    const result = new Map<"gold" | "silver", Map<string, number>>()
    result.set("gold", goldByDate)
    result.set("silver", silverByDate)
    return result
  } catch (err) {
    console.warn("[precious-metals] Historical metal fetch failed:", err)
    return new Map()
  }
}

function logMetalpriceLatestInvalid(
  data: {
    success?: boolean
    rates?: MetalpriceApiRates
    error?: unknown
    message?: unknown
  },
  httpStatus: number,
) {
  if (data.success === false || !data.rates) {
    const detail = metalpriceApiDetail(data as Record<string, unknown>)
    console.warn(
      `[precious-metals] MetalpriceAPI latest invalid (HTTP ${httpStatus}): ${detail}`,
    )
  }
}

async function fetchMetalpriceLatest(): Promise<PreciousMetalPrice[]> {
  const apiKey = process.env.METALPRICEAPI_API_KEY?.trim() ?? ""
  if (!apiKey) {
    console.warn("[precious-metals] METALPRICEAPI_API_KEY not configured. Returning empty.")
    return makeFallback()
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      base: "USD",
      currencies: "XAU,XAG,SGD",
    })
    const url = `${METALPRICEAPI_LATEST}?${params.toString()}`

    const res = await fetch(url)

    if (!res.ok) {
      console.warn(
        `[precious-metals] MetalpriceAPI returned ${res.status}. Returning empty.`,
      )
      return makeFallback()
    }

    const data = (await res.json()) as {
      success?: boolean
      base?: string
      timestamp?: number
      rates?: MetalpriceApiRates
      error?: string
      message?: string
    }

    logMetalpriceLatestInvalid(data, res.status)

    if (!data.success || !data.rates) {
      return makeFallback()
    }

    const r = data.rates

    // Prefer USDXAU/USDXAG (USD per oz) when available; otherwise derive from XAU/XAG (oz per USD)
    const usdPerOzGold =
      typeof r.USDXAU === "number" ? r.USDXAU : typeof r.XAU === "number" ? 1 / r.XAU : 0
    const usdPerOzSilver =
      typeof r.USDXAG === "number" ? r.USDXAG : typeof r.XAG === "number" ? 1 / r.XAG : 0
    const sgdPerUsd = typeof r.SGD === "number" ? r.SGD : 0

    if (!usdPerOzGold || !usdPerOzSilver || !sgdPerUsd) {
      console.warn("[precious-metals] MetalpriceAPI missing XAU/XAG/SGD rates.")
      return makeFallback()
    }

    const goldSgd = usdPerOzGold * sgdPerUsd
    const silverSgd = usdPerOzSilver * sgdPerUsd

    const spread = 0.004
    const result: PreciousMetalPrice[] = [
      {
        metalType: "gold",
        buyPriceSgd: Math.round(goldSgd * (1 + spread) * 100) / 100,
        sellPriceSgd: Math.round(goldSgd * (1 - spread) * 100) / 100,
        unit: "oz",
        timestamp: new Date().toISOString(),
        source: "live",
      },
      {
        metalType: "silver",
        buyPriceSgd: Math.round(silverSgd * (1 + spread) * 100) / 100,
        sellPriceSgd: Math.round(silverSgd * (1 - spread) * 100) / 100,
        unit: "oz",
        timestamp: new Date().toISOString(),
        source: "live",
      },
    ]

    return result
  } catch (err) {
    console.warn("[precious-metals] MetalpriceAPI fetch failed:", err)
    return makeFallback()
  }
}

const OCBC_METALS_URL = "https://www.ocbc.com/api/precious-metals/prices"

const OCBC_FETCH_INIT: RequestInit = {
  next: { revalidate: 1800 },
  headers: {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (compatible; fdb-tracker/1.0; +https://github.com/)",
  },
}

async function fetchOcbcPreciousMetalPricesRaw(): Promise<
  PreciousMetalPrice[] | null
> {
  const res = await fetch(OCBC_METALS_URL, OCBC_FETCH_INIT)

  if (!res.ok) {
    console.warn(`[precious-metals] OCBC API returned ${res.status}.`)
    return null
  }

  const contentType = res.headers.get("content-type") ?? ""
  const text = await res.text()
  if (
    !contentType.includes("application/json") ||
    (!text.trim().startsWith("{") && !text.trim().startsWith("["))
  ) {
    console.warn("[precious-metals] OCBC API returned non-JSON.")
    return null
  }

  const raw = JSON.parse(text) as Array<{
    metal: string
    buyPrice: number
    sellPrice: number
    unit: string
  }>

  return raw.map((item) => ({
    metalType: item.metal,
    buyPriceSgd: item.buyPrice,
    sellPriceSgd: item.sellPrice,
    unit: item.unit,
    timestamp: new Date().toISOString(),
    source: "live" as const,
  }))
}

const YAHOO_GOLD_TICKER = "GC=F"
const YAHOO_SILVER_TICKER = "SI=F"

async function fetchYahooMetalPrices(): Promise<PreciousMetalPrice[] | null> {
  try {
    const { getYahooFinance } = await import(
      "@/lib/external/yahoo-finance-client"
    )
    const { getSgdPerUsd } = await import("@/lib/external/usd-sgd")

    const [yahooFinance, sgdPerUsd] = await Promise.all([
      getYahooFinance(),
      getSgdPerUsd(),
    ])

    if (!sgdPerUsd) {
      console.warn("[precious-metals] Yahoo fallback: no USD/SGD rate.")
      return null
    }

    const quotes = await yahooFinance.quote([
      YAHOO_GOLD_TICKER,
      YAHOO_SILVER_TICKER,
    ])
    const arr: unknown[] = Array.isArray(quotes) ? quotes : [quotes]

    const findPrice = (ticker: string): number | null => {
      const q = arr.find(
        (r) => (r as { symbol?: string })?.symbol === ticker,
      ) as { regularMarketPrice?: number } | undefined
      const p = q?.regularMarketPrice
      return typeof p === "number" && p > 0 ? p : null
    }

    const goldUsd = findPrice(YAHOO_GOLD_TICKER)
    const silverUsd = findPrice(YAHOO_SILVER_TICKER)

    if (!goldUsd && !silverUsd) {
      console.warn("[precious-metals] Yahoo fallback: no valid metal prices.")
      return null
    }

    const spread = 0.004
    const result: PreciousMetalPrice[] = []

    if (goldUsd) {
      const sgd = goldUsd * sgdPerUsd
      result.push({
        metalType: "gold",
        buyPriceSgd: Math.round(sgd * (1 + spread) * 100) / 100,
        sellPriceSgd: Math.round(sgd * (1 - spread) * 100) / 100,
        unit: "oz",
        timestamp: new Date().toISOString(),
        source: "live",
      })
    }

    if (silverUsd) {
      const sgd = silverUsd * sgdPerUsd
      result.push({
        metalType: "silver",
        buyPriceSgd: Math.round(sgd * (1 + spread) * 100) / 100,
        sellPriceSgd: Math.round(sgd * (1 - spread) * 100) / 100,
        unit: "oz",
        timestamp: new Date().toISOString(),
        source: "live",
      })
    }

    return result
  } catch (err) {
    console.warn("[precious-metals] Yahoo metal prices failed:", err)
    return null
  }
}

export async function getOcbcPreciousMetalPrices(): Promise<
  PreciousMetalPrice[]
> {
  if (metalsCache && metalsCache.expires > Date.now()) {
    return metalsCache.data
  }

  const hasMetalpriceKey =
    (process.env.METALPRICEAPI_API_KEY?.trim() ?? "") !== ""

  if (hasMetalpriceKey) {
    const fromMetal = await fetchMetalpriceLatest()
    if (fromMetal.length > 0) {
      metalsCache = { data: fromMetal, expires: Date.now() + CACHE_TTL_MS }
      return fromMetal
    }
  }

  try {
    const fromOcbc = await fetchOcbcPreciousMetalPricesRaw()
    if (fromOcbc && fromOcbc.length > 0) {
      metalsCache = { data: fromOcbc, expires: Date.now() + CACHE_TTL_MS }
      return fromOcbc
    }
  } catch (err) {
    console.warn("[precious-metals] Failed to fetch OCBC prices:", err)
  }

  try {
    const fromYahoo = await fetchYahooMetalPrices()
    if (fromYahoo && fromYahoo.length > 0) {
      metalsCache = { data: fromYahoo, expires: Date.now() + CACHE_TTL_MS }
      return fromYahoo
    }
  } catch (err) {
    console.warn("[precious-metals] Failed to fetch Yahoo prices:", err)
  }

  const fromDb = await fetchFromDb()
  if (fromDb.length > 0) {
    metalsCache = { data: fromDb, expires: Date.now() + DB_FALLBACK_TTL_MS }
    return fromDb
  }

  return []
}
