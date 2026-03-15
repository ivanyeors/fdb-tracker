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
    const url = new URL(
      `https://api.eulerpool.com/v1/equities/${encodeURIComponent(ticker)}/price`,
    );
    url.searchParams.set("token", apiKey);

    const res = await fetch(url.toString());

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

function extractResultsFromResponse(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["results", "data", "items", "equities"]) {
      const val = obj[key];
      if (Array.isArray(val)) return val as Record<string, unknown>[];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const inner = val as Record<string, unknown>;
        for (const k of ["stocks", "equities", "list"]) {
          if (Array.isArray(inner[k])) return inner[k] as Record<string, unknown>[];
        }
      }
    }
  }
  return [];
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const apiKey = process.env.EULERPOOL_API_KEY ?? "";
  if (!apiKey) {
    console.warn("[eulerpool] EULERPOOL_API_KEY not configured. Stock search disabled.");
    return [];
  }

  try {
    const url = new URL("https://api.eulerpool.com/api/1/equity/search");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("token", apiKey);

    const res = await fetch(url.toString());

    if (!res.ok) {
      console.warn(`[eulerpool] Search API returned ${res.status} for query "${trimmed}"`);
      return [];
    }

    const data = (await res.json()) as unknown;
    const rawResults = extractResultsFromResponse(data);

    const mapped = rawResults
      .map((r) => {
        const item = typeof r === "string" ? { ticker: r } : (r as Record<string, unknown>);
        const ticker = String(item.ticker ?? item.symbol ?? item.id ?? "");
        const type = (item.type as string | undefined) ?? "";
        return {
          ticker,
          name: (item.name as string | undefined) ?? undefined,
          exchange: (item.exchange as string | undefined) ?? (item.type as string | undefined),
          type: type.toLowerCase(),
        };
      })
      .filter((r) => r.ticker.length > 0);

    const queryUpper = trimmed.toUpperCase();
    mapped.sort((a, b) => {
      const aExact = a.ticker.toUpperCase() === queryUpper;
      const bExact = b.ticker.toUpperCase() === queryUpper;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      const typeOrder = (t: string) => (t === "stock" ? 0 : t === "etf" ? 1 : 2);
      return typeOrder(a.type) - typeOrder(b.type);
    });

    return mapped
      .slice(0, 12)
      .map(({ ticker, name, exchange, type }) => ({
        ticker,
        name,
        exchange: exchange ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : undefined),
      }));
  } catch (err) {
    console.warn("[eulerpool] Search failed:", err);
    return [];
  }
}
