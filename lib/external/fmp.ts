import { tickerLookupVariants } from "@/lib/investments/ticker-lookup"

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
    console.warn(
      "[fmp] FMP_API_KEY not configured. Using Yahoo Finance for quotes.",
    );
    const yahooResults = await fetchYahooQuoteFallback(tickers);
    const hasValid = yahooResults.some((r) => r.price > 0);
    if (hasValid) return yahooResults;
    return tickers.map(makeFallback);
  }

  const symbols = tickers.join(",");
  const params = new URLSearchParams({ symbols, apikey: apiKey });
  const url = `${FMP_STABLE_BASE}/batch-quote?${params.toString()}`;

  try {
    const res = await fetch(url);

    if (res.status === 403 || res.status === 402 || res.status === 429) {
      console.warn(
        res.status === 429
          ? "[fmp] FMP returned 429 (rate limit). Using Yahoo Finance for quotes."
          : `[fmp] FMP returned ${res.status}. Using Yahoo Finance for quotes (Stable API not entitled or forbidden).`,
      );
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
        for (const k of tickerLookupVariants(mapped.ticker)) {
          if (!priceMap.has(k)) priceMap.set(k, mapped);
        }
      }
    }

    const fmpMapped = tickers.map((t) => {
      for (const k of tickerLookupVariants(t)) {
        const hit = priceMap.get(k);
        if (
          hit &&
          typeof hit.price === "number" &&
          Number.isFinite(hit.price) &&
          hit.price > 0
        ) {
          return hit;
        }
      }
      return makeFallback(t);
    });
    const fmpHasAny = fmpMapped.some(
      (r) => typeof r.price === "number" && r.price > 0,
    );
    if (!fmpHasAny && tickers.length > 0) {
      console.warn(
        "[fmp] FMP batch returned no valid prices for requested symbols; trying Yahoo.",
      );
      const yahooResults = await fetchYahooQuoteFallback(tickers);
      if (yahooResults.some((r) => r.price > 0)) return yahooResults;
    }
    return fmpMapped;
  } catch (err) {
    console.warn("[fmp] Failed to fetch quote:", err);
    return tickers.map(makeFallback);
  }
}

type YahooQuoteRow = {
  symbol?: string
  regularMarketPrice?: number
  regularMarketChange?: number
  regularMarketChangePercent?: number
  regularMarketVolume?: number
  currency?: string
}

/** Yahoo batch quote order may not match request order; match by `symbol`. */
function findYahooQuoteRow(
  rows: unknown[],
  ticker: string,
): YahooQuoteRow | undefined {
  const u = ticker.toUpperCase()
  const alt = u.replace(/\./g, "-")
  for (const item of rows) {
    const q = item as YahooQuoteRow
    const sym = (q.symbol ?? "").toUpperCase()
    if (!sym) continue
    if (sym === u || sym === alt) return q
  }
  return undefined
}

function yahooRowToStockPrice(q: YahooQuoteRow, ticker: string): StockPrice {
  if (!q || typeof q.regularMarketPrice !== "number") {
    return makeFallback(ticker);
  }
  return {
    ticker: (q.symbol ?? ticker).toUpperCase(),
    price: q.regularMarketPrice,
    change: typeof q.regularMarketChange === "number" ? q.regularMarketChange : 0,
    changePct:
      typeof q.regularMarketChangePercent === "number"
        ? q.regularMarketChangePercent
        : 0,
    volume: typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : 0,
    timestamp: new Date().toISOString(),
    currency: typeof q.currency === "string" ? q.currency : "USD",
  };
}

async function fetchYahooQuoteFallback(tickers: string[]): Promise<StockPrice[]> {
  const { getYahooFinance } = await import("@/lib/external/yahoo-finance-client");
  const yahooFinance = await getYahooFinance();

  const tryBatch = async (): Promise<StockPrice[] | null> => {
    try {
      const quotes = await yahooFinance.quote(tickers);
      const arr: unknown[] = Array.isArray(quotes) ? quotes : [quotes];
      const mapped = tickers.map((ticker) => {
        const q = findYahooQuoteRow(arr, ticker);
        return yahooRowToStockPrice(q ?? {}, ticker);
      });
      return mapped.some((r) => r.price > 0) ? mapped : null;
    } catch (err) {
      console.warn("[fmp] Yahoo batch quote failed:", err);
      return null;
    }
  };

  const batch = await tryBatch();
  if (batch) return batch;

  const perTicker = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const raw = await yahooFinance.quote(ticker);
        const row = Array.isArray(raw) ? raw[0] : raw;
        const q = row as YahooQuoteRow;
        return yahooRowToStockPrice(q ?? {}, ticker);
      } catch {
        return makeFallback(ticker);
      }
    }),
  );
  if (perTicker.some((r) => r.price > 0)) return perTicker;

  console.warn("[fmp] Yahoo per-ticker quotes returned no valid prices.");
  return tickers.map(makeFallback);
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
    let res = await fetch(url);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000));
      res = await fetch(url);
    }

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

function getCachedQuote(ticker: string, now: number): CacheEntry | undefined {
  for (const k of tickerLookupVariants(ticker)) {
    const entry = cache.get(k);
    if (!entry || entry.expires <= now) continue;
    if (
      typeof entry.data.price === "number" &&
      Number.isFinite(entry.data.price) &&
      entry.data.price > 0
    ) {
      return entry;
    }
  }
  return undefined;
}

export async function getMultipleStockPrices(
  tickers: string[],
): Promise<StockPrice[]> {
  if (tickers.length === 0) return [];

  const now = Date.now();
  const uniqueTickers = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const toFetch: string[] = [];
  for (const t of uniqueTickers) {
    if (!getCachedQuote(t, now)) toFetch.push(t);
  }

  if (toFetch.length > 0) {
    const results = await fetchBatchQuotes(toFetch);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const requested = toFetch[i];
      if (
        typeof r.price !== "number" ||
        !Number.isFinite(r.price) ||
        r.price <= 0
      ) {
        for (const k of tickerLookupVariants(requested)) cache.delete(k);
        continue;
      }
      const keys = new Set([
        ...tickerLookupVariants(requested),
        ...tickerLookupVariants(r.ticker),
      ]);
      for (const k of keys) {
        cache.set(k, {
          data: r,
          expires: now + CACHE_TTL_MS,
        });
      }
    }
  }

  return tickers.map((t) => {
    const entry = getCachedQuote(t, now);
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
