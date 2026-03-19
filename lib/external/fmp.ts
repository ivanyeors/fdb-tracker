export type StockPrice = {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: string;
  currency: string;
};

export type StockSearchResult = {
  ticker: string;
  name?: string;
  exchange?: string;
};

type CacheEntry = {
  data: StockPrice;
  expires: number;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
/** FMP stable API per https://site.financialmodelingprep.com/developer/docs/quickstart */
const FMP_STABLE_BASE = "https://financialmodelingprep.com/stable";

const cache = new Map<string, CacheEntry>();

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

/** Stable API uses changePercentage; legacy v3 uses changesPercentage */
type FmpQuoteItem = {
  symbol?: string;
  price?: number;
  change?: number;
  changePercentage?: number;
  changesPercentage?: number;
  volume?: number;
  timestamp?: number | string;
  currency?: string;
};

function mapFmpQuoteToStockPrice(item: FmpQuoteItem): StockPrice {
  const ticker = String(item.symbol ?? "").toUpperCase() || "UNKNOWN";
  const price = typeof item.price === "number" ? item.price : 0;
  const change = typeof item.change === "number" ? item.change : 0;
  const changePct =
    typeof item.changePercentage === "number"
      ? item.changePercentage
      : typeof item.changesPercentage === "number"
        ? item.changesPercentage
        : 0;
  const volume = typeof item.volume === "number" ? item.volume : 0;
  const ts = item.timestamp;
  const timestamp =
    typeof ts === "number"
      ? new Date(ts * 1000).toISOString()
      : typeof ts === "string"
        ? ts
        : new Date().toISOString();
  const currency = typeof item.currency === "string" ? item.currency : "USD";

  return {
    ticker,
    price,
    change,
    changePct,
    volume,
    timestamp,
    currency,
  };
}

function getApiKey(): string {
  return process.env.FMP_API_KEY?.trim() ?? "";
}

async function fetchBatchQuotes(tickers: string[]): Promise<StockPrice[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[fmp] FMP_API_KEY not configured. Returning fallbacks.");
    return tickers.map(makeFallback);
  }

  const symbols = tickers.join(",");
  const params = new URLSearchParams({ symbols, apikey: apiKey });
  const url = `${FMP_STABLE_BASE}/batch-quote?${params.toString()}`;

  try {
    const res = await fetch(url);

    if (res.status === 403) {
      console.warn("[fmp] FMP returned 403. Using Yahoo Finance fallback (no API key).");
      const yahooResults = await fetchYahooQuoteFallback(tickers);
      const hasValid = yahooResults.some((r) => r.price > 0);
      if (hasValid) return yahooResults;
      return tickers.map(makeFallback);
    }

    if (!res.ok) {
      console.warn(`[fmp] API returned ${res.status} for quote. Returning fallbacks.`);
      return tickers.map(makeFallback);
    }

    const data = (await res.json()) as unknown;
    const items = Array.isArray(data) ? data : [];

    const priceMap = new Map<string, StockPrice>();
    for (const item of items as FmpQuoteItem[]) {
      const mapped = mapFmpQuoteToStockPrice(item);
      if (mapped.ticker && mapped.ticker !== "UNKNOWN") {
        priceMap.set(mapped.ticker.toUpperCase(), mapped);
      }
    }

    return tickers.map((t) => {
      const key = t.toUpperCase();
      return priceMap.get(key) ?? makeFallback(t);
    });
  } catch (err) {
    console.warn("[fmp] Failed to fetch quote:", err);
    return tickers.map(makeFallback);
  }
}

async function fetchYahooQuoteFallback(tickers: string[]): Promise<StockPrice[]> {
  try {
    const YahooFinance = (await import("yahoo-finance2")).default;
    const quotes = await YahooFinance.quote(tickers);
    const arr: unknown[] = Array.isArray(quotes) ? quotes : [quotes];
    return tickers.map((ticker, i) => {
      const q = arr[i] as { regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number; regularMarketVolume?: number; currency?: string; symbol?: string } | undefined;
      if (!q || typeof q.regularMarketPrice !== "number") {
        return makeFallback(ticker);
      }
      return {
        ticker: (q.symbol ?? ticker).toUpperCase(),
        price: q.regularMarketPrice,
        change: typeof q.regularMarketChange === "number" ? q.regularMarketChange : 0,
        changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : 0,
        volume: typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : 0,
        timestamp: new Date().toISOString(),
        currency: typeof q.currency === "string" ? q.currency : "USD",
      };
    });
  } catch (err) {
    console.warn("[fmp] Yahoo fallback failed:", err);
    return tickers.map(makeFallback);
  }
}

export type HistoricalPricePoint = {
  date: string;
  close: number;
};

const historicalCache = new Map<string, { data: HistoricalPricePoint[]; expires: number }>();
const HISTORICAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** FMP historical EOD response item */
type FmpHistoricalItem = {
  date?: string;
  close?: number;
  adjClose?: number;
};

export async function getHistoricalPrices(
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<HistoricalPricePoint[]> {
  const cacheKey = `${ticker.toUpperCase()}:${fromDate}:${toDate}`;
  const now = Date.now();
  const cached = historicalCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.data;

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[fmp] FMP_API_KEY not configured. Historical prices unavailable.");
    return [];
  }

  try {
    const params = new URLSearchParams({
      symbol: ticker.toUpperCase(),
      from_date: fromDate,
      to_date: toDate,
      apikey: apiKey,
    });
    const url = `${FMP_STABLE_BASE}/historical-price-eod/full?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`[fmp] Historical API returned ${res.status} for ${ticker}`);
      return [];
    }

    const data = (await res.json()) as unknown;
    const items = Array.isArray(data) ? (data as FmpHistoricalItem[]) : [];

    const result: HistoricalPricePoint[] = items
      .filter((item) => item.date && (typeof item.close === "number" || typeof item.adjClose === "number"))
      .map((item) => ({
        date: String(item.date),
        close: typeof item.adjClose === "number" && item.adjClose > 0
          ? item.adjClose
          : typeof item.close === "number"
            ? item.close
            : 0,
      }))
      .filter((p) => p.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    historicalCache.set(cacheKey, { data: result, expires: now + HISTORICAL_CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn("[fmp] Failed to fetch historical prices:", err);
    return [];
  }
}

/** Fetch historical prices for multiple tickers in parallel. Returns a map of ticker -> date -> close. */
export async function getHistoricalPricesBatch(
  tickers: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, Map<string, number>>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const results = await Promise.all(
    unique.map(async (t) => {
      const points = await getHistoricalPrices(t, fromDate, toDate);
      const byDate = new Map<string, number>();
      for (const p of points) byDate.set(p.date, p.close);
      return { ticker: t, byDate } as const;
    }),
  );
  const map = new Map<string, Map<string, number>>();
  for (const r of results) map.set(r.ticker, r.byDate);
  return map;
}

export async function getStockPrice(ticker: string): Promise<StockPrice> {
  const [result] = await getMultipleStockPrices([ticker]);
  return result;
}

export async function getMultipleStockPrices(
  tickers: string[],
): Promise<StockPrice[]> {
  if (tickers.length === 0) return [];

  const now = Date.now();
  const uniqueTickers = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const toFetch: string[] = [];
  for (const t of uniqueTickers) {
    const entry = cache.get(t);
    if (!entry || entry.expires <= now) toFetch.push(t);
  }

  if (toFetch.length > 0) {
    const results = await fetchBatchQuotes(toFetch);
    for (const r of results) {
      if (r.ticker) {
        cache.set(r.ticker.toUpperCase(), {
          data: r,
          expires: now + CACHE_TTL_MS,
        });
      }
    }
  }

  return tickers.map((t) => {
    const key = t.toUpperCase();
    const entry = cache.get(key);
    return entry ? entry.data : makeFallback(t);
  });
}

type FmpSearchItem = {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  type?: string;
};

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[fmp] FMP_API_KEY not configured. Stock search disabled.");
    return [];
  }

  try {
    const params = new URLSearchParams({ query: trimmed, apikey: apiKey });
    const url = `${FMP_STABLE_BASE}/search-symbol?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`[fmp] Search API returned ${res.status} for query "${trimmed}"`);
      return [];
    }

    const data = (await res.json()) as unknown;
    const items = Array.isArray(data) ? (data as FmpSearchItem[]) : [];

    const mapped = items
      .map((item) => {
        const ticker = String(item.symbol ?? item.name ?? "").trim();
        if (!ticker) return null;
        return {
          ticker,
          name: typeof item.name === "string" ? item.name : undefined,
          exchange: typeof item.exchange === "string" ? item.exchange : undefined,
          type: (typeof item.type === "string" ? item.type : "").toLowerCase(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.ticker.length > 0);

    const queryUpper = trimmed.toUpperCase();
    mapped.sort((a, b) => {
      const aExact = a.ticker.toUpperCase() === queryUpper;
      const bExact = b.ticker.toUpperCase() === queryUpper;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      const typeOrder = (t: string) => (t === "stock" ? 0 : t === "etf" ? 1 : 2);
      return typeOrder(a.type) - typeOrder(b.type);
    });

    return mapped.slice(0, 12).map(({ ticker, name, exchange, type }) => ({
      ticker,
      name,
      exchange: exchange ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : undefined),
    }));
  } catch (err) {
    console.warn("[fmp] Search failed:", err);
    return [];
  }
}
