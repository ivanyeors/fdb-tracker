export type PreciousMetalPrice = {
  metalType: string
  buyPriceSgd: number
  sellPriceSgd: number
  unit: string
  timestamp: string
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

const METALPRICEAPI_BASE = "https://api.metalpriceapi.com/v1"
const METALPRICEAPI_TIMEFRAME = `${METALPRICEAPI_BASE}/timeframe`

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
        const sellSgd = Math.round(usdPerOzGold * sgdPerUsd * (1 - 0.01) * 100) / 100
        goldByDate.set(dateStr, sellSgd)
        goldList.push({ date: dateStr, sellPriceSgd: sellSgd })
      }
      if (usdPerOzSilver > 0 && sgdPerUsd > 0) {
        const sellSgd = Math.round(usdPerOzSilver * sgdPerUsd * (1 - 0.01) * 100) / 100
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

async function getMetalpriceApiFallback(): Promise<PreciousMetalPrice[]> {
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
    const url = `${METALPRICEAPI_BASE}?${params.toString()}`

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
    }

    if (!data.success || !data.rates) {
      console.warn("[precious-metals] MetalpriceAPI returned invalid data.")
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

    const spread = 0.01
    const result: PreciousMetalPrice[] = [
      {
        metalType: "gold",
        buyPriceSgd: Math.round(goldSgd * (1 + spread) * 100) / 100,
        sellPriceSgd: Math.round(goldSgd * (1 - spread) * 100) / 100,
        unit: "oz",
        timestamp: new Date().toISOString(),
      },
      {
        metalType: "silver",
        buyPriceSgd: Math.round(silverSgd * (1 + spread) * 100) / 100,
        sellPriceSgd: Math.round(silverSgd * (1 - spread) * 100) / 100,
        unit: "oz",
        timestamp: new Date().toISOString(),
      },
    ]

    return result
  } catch (err) {
    console.warn("[precious-metals] MetalpriceAPI fetch failed:", err)
    return makeFallback()
  }
}

export async function getOcbcPreciousMetalPrices(): Promise<
  PreciousMetalPrice[]
> {
  if (metalsCache && metalsCache.expires > Date.now()) {
    return metalsCache.data
  }

  try {
    const res = await fetch(
      "https://www.ocbc.com/api/precious-metals/prices",
      { next: { revalidate: 1800 } },
    )

    if (!res.ok) {
      console.warn(
        `[precious-metals] OCBC API returned ${res.status}. Trying fallback.`,
      )
      const fallback = await getMetalpriceApiFallback()
      if (fallback.length > 0) {
        metalsCache = { data: fallback, expires: Date.now() + CACHE_TTL_MS }
        return fallback
      }
      return makeFallback()
    }

    const contentType = res.headers.get("content-type") ?? ""
    const text = await res.text()
    if (
      !contentType.includes("application/json") ||
      (!text.trim().startsWith("{") && !text.trim().startsWith("["))
    ) {
      console.warn("[precious-metals] OCBC API returned non-JSON. Trying fallback.")
      const fallback = await getMetalpriceApiFallback()
      if (fallback.length > 0) {
        metalsCache = { data: fallback, expires: Date.now() + CACHE_TTL_MS }
        return fallback
      }
      return makeFallback()
    }

    const raw = JSON.parse(text) as Array<{
      metal: string
      buyPrice: number
      sellPrice: number
      unit: string
    }>

    const data: PreciousMetalPrice[] = raw.map((item) => ({
      metalType: item.metal,
      buyPriceSgd: item.buyPrice,
      sellPriceSgd: item.sellPrice,
      unit: item.unit,
      timestamp: new Date().toISOString(),
    }))

    metalsCache = { data, expires: Date.now() + CACHE_TTL_MS }
    return data
  } catch (err) {
    console.warn("[precious-metals] Failed to fetch prices:", err)
    const fallback = await getMetalpriceApiFallback()
    if (fallback.length > 0) {
      metalsCache = { data: fallback, expires: Date.now() + CACHE_TTL_MS }
      return fallback
    }
    return makeFallback()
  }
}
