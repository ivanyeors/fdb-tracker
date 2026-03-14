export type StockPrice = {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: string;
  currency: string;
};

type CacheEntry = {
  data: StockPrice;
  expires: number;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const MONTHLY_LIMIT = 250;

const cache = new Map<string, CacheEntry>();
let monthlyRequestCount = 0;
let currentMonth = new Date().getMonth();

function resetMonthlyCounterIfNeeded(): void {
  const now = new Date().getMonth();
  if (now !== currentMonth) {
    monthlyRequestCount = 0;
    currentMonth = now;
  }
}

function makeFallback(ticker: string): StockPrice {
  return {
    ticker,
    price: 0,
    change: 0,
    changePct: 0,
    volume: 0,
    timestamp: new Date().toISOString(),
    currency: "USD",
  };
}

export async function getStockPrice(ticker: string): Promise<StockPrice> {
  const cached = cache.get(ticker);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  resetMonthlyCounterIfNeeded();
  if (monthlyRequestCount >= MONTHLY_LIMIT) {
    console.warn(
      `[eulerpool] Monthly request limit (${MONTHLY_LIMIT}) reached. Returning fallback for ${ticker}.`,
    );
    return makeFallback(ticker);
  }

  if (monthlyRequestCount >= MONTHLY_LIMIT - 10) {
    console.warn(
      `[eulerpool] Approaching monthly limit: ${monthlyRequestCount}/${MONTHLY_LIMIT} requests used.`,
    );
  }

  const apiKey = process.env.EULERPOOL_API_KEY ?? "";

  try {
    const res = await fetch(
      `https://api.eulerpool.com/v1/equities/${encodeURIComponent(ticker)}/price`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );

    monthlyRequestCount++;

    if (!res.ok) {
      console.warn(
        `[eulerpool] API returned ${res.status} for ${ticker}. Returning fallback.`,
      );
      return makeFallback(ticker);
    }

    const data = (await res.json()) as StockPrice;
    const entry: CacheEntry = { data, expires: Date.now() + CACHE_TTL_MS };
    cache.set(ticker, entry);
    return data;
  } catch (err) {
    console.warn(`[eulerpool] Failed to fetch ${ticker}:`, err);
    return makeFallback(ticker);
  }
}

export async function getMultipleStockPrices(
  tickers: string[],
): Promise<StockPrice[]> {
  const results = await Promise.allSettled(tickers.map(getStockPrice));

  return results.map((result, i) =>
    result.status === "fulfilled" ? result.value : makeFallback(tickers[i]!),
  );
}

export type StockSearchResult = {
  ticker: string;
  name?: string;
  exchange?: string;
};

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const apiKey = process.env.EULERPOOL_API_KEY ?? "";
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://api.eulerpool.com/v1/equities/search?q=${encodeURIComponent(trimmed)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );

    if (!res.ok) return [];

    const data = (await res.json()) as
      | StockSearchResult[]
      | { data?: StockSearchResult[] }
      | { results?: StockSearchResult[] };
    const results = Array.isArray(data)
      ? data
      : "data" in data && Array.isArray((data as { data: StockSearchResult[] }).data)
        ? (data as { data: StockSearchResult[] }).data
        : "results" in data && Array.isArray((data as { results: StockSearchResult[] }).results)
          ? (data as { results: StockSearchResult[] }).results
          : [];

    return results
      .slice(0, 10)
      .map((r) => {
        const item = typeof r === "string" ? { ticker: r } : r;
        return {
          ticker: String(item.ticker ?? ""),
          name: item.name,
          exchange: item.exchange,
        };
      })
      .filter((r) => r.ticker.length > 0);
  } catch {
    return [];
  }
}
