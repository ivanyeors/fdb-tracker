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
        `[precious-metals] OCBC API returned ${res.status}. Returning fallback.`,
      )
      return makeFallback()
    }

    const raw = (await res.json()) as Array<{
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
    return makeFallback()
  }
}
