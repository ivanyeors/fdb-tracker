import { metalpriceApiDetail } from "@/lib/external/metalprice-log"

const FMP_STABLE_BASE = "https://financialmodelingprep.com/stable"
const CACHE_TTL_MS = 30 * 60 * 1000

let cache: { rate: number; expires: number } | null = null

function getFmpKey(): string {
  return process.env.FMP_API_KEY?.trim() ?? ""
}

/**
 * SGD per 1 USD (multiply USD amount to get SGD).
 * Cached ~30m. Tries FMP USDSGD → MetalpriceAPI → Yahoo `USDSGD=X` (same real-data pattern as stock quotes when FMP is blocked).
 */
export async function getSgdPerUsd(): Promise<number | null> {
  const now = Date.now()
  if (cache && cache.expires > now) return cache.rate

  const fromFmp = await fetchSgdPerUsdFromFmp()
  if (fromFmp != null && fromFmp > 0) {
    cache = { rate: fromFmp, expires: now + CACHE_TTL_MS }
    return fromFmp
  }

  const fromMetal = await fetchSgdPerUsdFromMetalprice()
  if (fromMetal != null && fromMetal > 0) {
    cache = { rate: fromMetal, expires: now + CACHE_TTL_MS }
    return fromMetal
  }

  const fromYahoo = await fetchSgdPerUsdFromYahoo()
  if (fromYahoo != null && fromYahoo > 0) {
    cache = { rate: fromYahoo, expires: now + CACHE_TTL_MS }
    return fromYahoo
  }

  console.warn(
    "[usd-sgd] No FX rate from FMP, MetalpriceAPI, or Yahoo (configure FMP_API_KEY and/or METALPRICEAPI_API_KEY, or check network).",
  )
  return null
}

/** Yahoo Finance USD/SGD spot; used when FMP Stable batch-quote fails (e.g. 402) and Metalprice is unavailable. */
async function fetchSgdPerUsdFromYahoo(): Promise<number | null> {
  try {
    const { getYahooFinance } = await import("@/lib/external/yahoo-finance-client")
    const yahooFinance = await getYahooFinance()
    const quotes = await yahooFinance.quote(["USDSGD=X"])
    const q = Array.isArray(quotes) ? quotes[0] : quotes
    const raw = (q as { regularMarketPrice?: number } | undefined)?.regularMarketPrice
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null

    if (raw >= 1.0 && raw <= 2.0) return raw
    if (raw >= 0.5 && raw < 1.0) return 1 / raw
    return null
  } catch (err) {
    console.warn("[usd-sgd] Yahoo USDSGD=X quote failed:", err)
    return null
  }
}

async function fetchSgdPerUsdFromFmp(): Promise<number | null> {
  const apiKey = getFmpKey()
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({ symbols: "USDSGD", apikey: apiKey })
    const res = await fetch(`${FMP_STABLE_BASE}/batch-quote?${params}`)
    if (!res.ok) return null

    const data = (await res.json()) as Array<{ symbol?: string; price?: number }>
    const row = Array.isArray(data) ? data[0] : null
    const price = typeof row?.price === "number" ? row.price : 0
    if (price <= 0) return null

    // USDSGD should be ~1.2–1.5 (SGD per USD). If ~0.7, invert.
    if (price >= 1.0 && price <= 2.0) return price
    if (price >= 0.5 && price < 1.0) return 1 / price
    return null
  } catch {
    return null
  }
}

async function fetchSgdPerUsdFromMetalprice(): Promise<number | null> {
  const apiKey = process.env.METALPRICEAPI_API_KEY?.trim() ?? ""
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      base: "USD",
      currencies: "SGD",
    })
    const res = await fetch(`https://api.metalpriceapi.com/v1/latest?${params}`)
    if (!res.ok) return null

    const data = (await res.json()) as Record<string, unknown> & {
      success?: boolean
      rates?: { SGD?: number }
    }
    if (data.success === false) {
      console.warn("[usd-sgd] MetalpriceAPI:", metalpriceApiDetail(data))
    }
    const sgd = data.rates?.SGD
    return typeof sgd === "number" && sgd > 0 ? sgd : null
  } catch {
    return null
  }
}
