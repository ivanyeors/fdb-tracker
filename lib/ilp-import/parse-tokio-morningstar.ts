import * as cheerio from "cheerio"
import { parseTopHoldingsTable } from "./parse-top-holdings"
import type {
  FundFees,
  IlpFundReportParseResult,
  IlpFundReportSnapshot,
  PerformanceTable,
  RiskMeasures,
  SectorBreakdownRow,
  StockStats,
  StockStyleBox,
} from "./types"
import { parseTokioFundReportUrl } from "./parse-url"

function parseMonthFromNavDate(text: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text)
  if (!m) return null
  const day = Number.parseInt(m[1], 10)
  const monStr = m[2].toLowerCase().slice(0, 3)
  const year = Number.parseInt(m[3], 10)
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  }
  const mi = months[monStr]
  if (mi === undefined || !Number.isFinite(year)) return null
  const d = new Date(year, mi, Math.min(day, 28))
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${mo}-01`
}

function parseLatestNavNumber(text: string): number | null {
  const t = text.replaceAll(",", "").trim()
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function normalizeCell(s: string): string {
  return s.replaceAll("\u00a0", " ").replaceAll(/\s+/g, " ").trim()
}

/** Parse a numeric value from a cell that may contain −, –, %, commas, etc. */
function parseNumericCell(raw: string): number | null {
  const t = raw
    .replaceAll(/[−–]/g, "-")
    .replaceAll(/[,%]/g, "")
    .trim()
  if (t.length === 0 || t === "-" || t === "—") return null
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Extract a standard performance table (header row + up to 3 data rows: fund, benchmark, category).
 * Used for annual performance, calendar year returns, and trailing returns.
 */
function parsePerformanceSection(
  $: cheerio.CheerioAPI,
  sectionId: string,
  warnings: string[],
): PerformanceTable | undefined {
  const sec = $(`[section-id="${sectionId}"]`).first()
  if (sec.length === 0) return undefined

  const rows = sec.find("tr").toArray()
  if (rows.length < 2) {
    warnings.push(`${sectionId}: expected at least 2 rows, got ${rows.length}`)
    return undefined
  }

  const headerCells = $(rows[0])
    .find("th,td")
    .map((_, c) => normalizeCell($(c).text()))
    .get()

  const extractRow = (rowIdx: number): (string | null)[] | undefined => {
    if (rowIdx >= rows.length) return undefined
    const cells = $(rows[rowIdx])
      .find("th,td")
      .map((_, c) => normalizeCell($(c).text()))
      .get()
    return cells.slice(1).map((c) => (c.length > 0 ? c : null))
  }

  const periodLabels = headerCells.slice(1)
  const fundValues = extractRow(1) ?? []
  const benchmarkValues = extractRow(2)
  const categoryValues = extractRow(3)

  return {
    periodLabels,
    fundValues,
    ...(benchmarkValues && { benchmarkValues }),
    ...(categoryValues && { categoryValues }),
  }
}

/**
 * Aggregate sector breakdown from top holdings.
 * Groups by sector name and sums weightPct.
 */
function aggregateSectorBreakdown(
  topHoldings: IlpFundReportSnapshot["topHoldings"],
): SectorBreakdownRow[] | undefined {
  if (!topHoldings || topHoldings.length === 0) return undefined

  const sectorMap = new Map<string, number>()
  for (const h of topHoldings) {
    if (!h.sector || h.weightPct == null) continue
    const existing = sectorMap.get(h.sector) ?? 0
    sectorMap.set(h.sector, existing + h.weightPct)
  }

  if (sectorMap.size === 0) return undefined

  const rows: SectorBreakdownRow[] = []
  for (const [sector, weightPct] of sectorMap.entries()) {
    rows.push({ sector, weightPct: Math.round(weightPct * 100) / 100 })
  }
  return rows.sort((a, b) => b.weightPct - a.weightPct)
}

/**
 * Try to find and parse a dedicated sector exposure table.
 * Falls back to aggregating from top holdings.
 */
function parseSectorBreakdown(
  $: cheerio.CheerioAPI,
  topHoldings: IlpFundReportSnapshot["topHoldings"],
  warnings: string[],
): SectorBreakdownRow[] | undefined {
  // Try dedicated sector section first
  const sectorSec = $('[section-id="sectorExposure"]').first()
  if (sectorSec.length > 0) {
    const rows: SectorBreakdownRow[] = []
    sectorSec.find("tr").each((i, tr) => {
      if (i === 0) return // skip header
      const cells = $(tr)
        .find("th,td")
        .map((_, c) => normalizeCell($(c).text()))
        .get()
      if (cells.length < 2) return
      const w = parseNumericCell(cells[1])
      if (w != null) rows.push({ sector: cells[0], weightPct: w })
    })
    if (rows.length > 0) return rows.sort((a, b) => b.weightPct - a.weightPct)
    warnings.push("sectorExposure section found but no data extracted")
  }

  // Fallback: aggregate from top holdings
  return aggregateSectorBreakdown(topHoldings)
}

/**
 * Parse Morningstar style box (3×3 grid).
 * Looks for section-ids like "investmentStyle" or component-ids with style box data.
 */
function parseStockStyle(
  $: cheerio.CheerioAPI,
  warnings: string[],
): StockStyleBox | undefined {
  const styleSec =
    $('[section-id="investmentStyle"]').first().length > 0
      ? $('[section-id="investmentStyle"]').first()
      : $('[section-id="styleBox"]').first()

  if (styleSec.length === 0) return undefined

  try {
    // Look for style label text
    const labelEl = styleSec.find(".ec-key-value-pair__field-value").first()
    const styleLabel = labelEl.length > 0 ? normalizeCell(labelEl.text()) : undefined

    // Try to parse the 3x3 grid from cells
    const cells = styleSec.find("td, .sal-style-box__cell").toArray()
    if (cells.length >= 9) {
      const grid = cells.slice(0, 9).map((cell) => {
        const text = normalizeCell($(cell).text())
        return parseNumericCell(text)
      })
      return { grid, ...(styleLabel && { styleLabel }) }
    }

    // If no grid cells, at least return the label
    if (styleLabel) {
      return { grid: new Array(9).fill(null) as (number | null)[], styleLabel }
    }
  } catch {
    warnings.push("Failed to parse stock style box")
  }

  return undefined
}

/**
 * Parse fund statistics (P/E, P/B, dividend yield) from key-value pairs.
 */
function parseStockStats(
  $: cheerio.CheerioAPI,
  header: Record<string, string>,
): StockStats | undefined {
  const stats: StockStats = {}

  // Check header first (some reports include these in the main header)
  for (const [key, val] of Object.entries(header)) {
    const kl = key.toLowerCase()
    if (kl.includes("p/e") || kl.includes("price/earnings")) {
      stats.peRatio = parseNumericCell(val)
    } else if (kl.includes("p/b") || kl.includes("price/book")) {
      stats.pbRatio = parseNumericCell(val)
    } else if (kl.includes("dividend yield") || kl.includes("div yield")) {
      stats.dividendYield = parseNumericCell(val)
    }
  }

  // Look for a dedicated fund statistics section
  const statsSec = $('[section-id="fundStats"]').first()
  if (statsSec.length > 0) {
    statsSec.find(".ec-key-value-pair").each((_, pair) => {
      const label = normalizeCell(
        $(pair).find(".ec-key-value-pair__field-label").text() ||
          $(pair).find(".ec-key-value-pair__field-name").text(),
      ).toLowerCase()
      const val = normalizeCell(
        $(pair).find(".ec-key-value-pair__field-value").text(),
      )
      if (label.includes("p/e") || label.includes("price/earnings")) {
        stats.peRatio = parseNumericCell(val)
      } else if (label.includes("p/b") || label.includes("price/book")) {
        stats.pbRatio = parseNumericCell(val)
      } else if (
        label.includes("dividend yield") ||
        label.includes("div yield")
      ) {
        stats.dividendYield = parseNumericCell(val)
      }
    })
  }

  const hasData =
    stats.peRatio != null ||
    stats.pbRatio != null ||
    stats.dividendYield != null
  return hasData ? stats : undefined
}

/**
 * Parse fee information (expense ratio, management fee).
 */
function parseFees(
  $: cheerio.CheerioAPI,
  header: Record<string, string>,
): FundFees | undefined {
  const fees: FundFees = {}

  // Check header key-value pairs
  for (const [key, val] of Object.entries(header)) {
    const kl = key.toLowerCase()
    if (kl.includes("expense ratio") || kl.includes("ongoing charge")) {
      fees.expenseRatio = parseNumericCell(val)
    } else if (kl.includes("management fee")) {
      fees.managementFee = parseNumericCell(val)
    }
  }

  // Look for dedicated fees/charges section
  const feesSec =
    $('[section-id="feesAndExpenses"]').first().length > 0
      ? $('[section-id="feesAndExpenses"]').first()
      : $('[section-id="fees"]').first()

  if (feesSec.length > 0) {
    feesSec.find(".ec-key-value-pair").each((_, pair) => {
      const label = normalizeCell(
        $(pair).find(".ec-key-value-pair__field-label").text() ||
          $(pair).find(".ec-key-value-pair__field-name").text(),
      ).toLowerCase()
      const val = normalizeCell(
        $(pair).find(".ec-key-value-pair__field-value").text(),
      )
      if (label.includes("expense ratio") || label.includes("ongoing charge")) {
        fees.expenseRatio = parseNumericCell(val)
      } else if (label.includes("management fee")) {
        fees.managementFee = parseNumericCell(val)
      }
    })
  }

  const hasData = fees.expenseRatio != null || fees.managementFee != null
  return hasData ? fees : undefined
}

/**
 * Parse risk measures (standard deviation, Sharpe ratio, alpha, beta).
 */
function parseRiskMeasures(
  $: cheerio.CheerioAPI,
  warnings: string[],
): RiskMeasures | undefined {
  const riskSec =
    $('[section-id="riskMeasures"]').first().length > 0
      ? $('[section-id="riskMeasures"]').first()
      : $('[section-id="riskStatistics"]').first()

  if (riskSec.length === 0) return undefined

  const measures: RiskMeasures = {}

  try {
    // Try key-value pairs first
    riskSec.find(".ec-key-value-pair").each((_, pair) => {
      const label = normalizeCell(
        $(pair).find(".ec-key-value-pair__field-label").text() ||
          $(pair).find(".ec-key-value-pair__field-name").text(),
      ).toLowerCase()
      const val = normalizeCell(
        $(pair).find(".ec-key-value-pair__field-value").text(),
      )
      if (label.includes("standard deviation") || label.includes("std dev")) {
        measures.standardDeviation = parseNumericCell(val)
      } else if (label.includes("sharpe")) {
        measures.sharpeRatio = parseNumericCell(val)
      } else if (label === "alpha" || label.includes("alpha")) {
        measures.alpha = parseNumericCell(val)
      } else if (label === "beta" || label.includes("beta")) {
        measures.beta = parseNumericCell(val)
      }
    })

    // Also try table rows (some reports use tables for risk stats)
    riskSec.find("tr").each((_, tr) => {
      const cells = $(tr)
        .find("th,td")
        .map((__, c) => normalizeCell($(c).text()))
        .get()
      if (cells.length < 2) return
      const label = cells[0].toLowerCase()
      const val = cells[1]
      if (label.includes("standard deviation") || label.includes("std dev")) {
        measures.standardDeviation = parseNumericCell(val)
      } else if (label.includes("sharpe")) {
        measures.sharpeRatio = parseNumericCell(val)
      } else if (label === "alpha" || label.startsWith("alpha")) {
        measures.alpha = parseNumericCell(val)
      } else if (label === "beta" || label.startsWith("beta")) {
        measures.beta = parseNumericCell(val)
      }
    })
  } catch {
    warnings.push("Failed to parse risk measures")
  }

  const hasData =
    measures.standardDeviation != null ||
    measures.sharpeRatio != null ||
    measures.alpha != null ||
    measures.beta != null
  return hasData ? measures : undefined
}

export function parseTokioMorningstarHtml(
  html: string,
  snapshotUrl: string | null,
  _options?: { sourceFile?: string },
): IlpFundReportParseResult {
  const warnings: string[] = []
  const $ = cheerio.load(html)
  const { msId, currencyId } = parseTokioFundReportUrl(snapshotUrl)

  const mainTitle = $('[section-id="mainTitle"]').first().text().trim()
  const investmentName = mainTitle.length > 0 ? normalizeCell(mainTitle) : null
  if (!investmentName) warnings.push("Missing investment name (mainTitle)")

  const header: Record<string, string> = {}
  const sectionIds = [
    "latestNav",
    "latestNavDate",
    "isin",
    "currency",
    "totalAssetsMonthEndWithDate",
    "fundBenchmark",
    "mstarCategory",
  ] as const
  for (const sid of sectionIds) {
    const sec = $(`[section-id="${sid}"]`).first()
    const label =
      sec.find(".ec-key-value-pair__field-label").first().text().trim() ||
      sec.find(".ec-key-value-pair__field-name").first().text().trim()
    const val = sec.find(".ec-key-value-pair__field-value").first().text().trim()
    const key = label.length > 0 ? normalizeCell(label) : sid
    if (val.length > 0) header[key] = normalizeCell(val)
  }

  const growthChartPresent =
    $(`[section-id="sharePriceInteractiveChart"]`).length > 0 &&
    $(`[section-id="sharePriceInteractiveChart"]`).text().trim().length > 10

  // --- Annual performance ---
  const annualPerformance = parsePerformanceSection(
    $,
    "annualPerformanceTable",
    warnings,
  )
  const annualPerformanceTablePresent = annualPerformance != null

  // --- Trailing returns ---
  const trailingReturns = parsePerformanceSection(
    $,
    "trailingReturnsPanel",
    warnings,
  )
  const trailingReturnsTablePresent = trailingReturns != null

  // --- Calendar year returns ---
  const calendarYearReturns = parsePerformanceSection(
    $,
    "calendarYearReturns",
    warnings,
  )
  const calendarYearReturnsPresent = calendarYearReturns != null

  /** Asset allocation: first table under heading "Asset Allocation" */
  let assetAllocation: IlpFundReportSnapshot["assetAllocation"]
  let foundTable = false
  $("table").each((_, table) => {
    if (foundTable) return
    const firstRow = $(table).find("tr").first().text()
    if (!/Asset Allocation/i.test(firstRow)) return
    foundTable = true
    const rows: NonNullable<IlpFundReportSnapshot["assetAllocation"]> = []
    $(table)
      .find("tr")
      .each((i, tr) => {
        if (i === 0) return
        const cells = $(tr)
          .find("th,td")
          .map((__, c) => normalizeCell($(c).text()))
          .get()
        if (cells.length < 2) return
        const label = cells[0]
        const w = Number.parseFloat(cells[1].replaceAll(/[−–-]/g, "-"))
        const cat =
          cells.length > 2 ? Number.parseFloat(cells[2].replaceAll(/[−–-]/g, "-")) : Number.NaN
        rows.push({
          label,
          weightPct: Number.isFinite(w) ? w : null,
          categoryPct: Number.isFinite(cat) ? cat : null,
        })
      })
    if (rows.length > 0) assetAllocation = rows
  })
  if (!foundTable) warnings.push("No Asset Allocation table matched")

  const topHoldings = parseTopHoldingsTable($)

  // --- Version 2 extractions ---
  const sectorBreakdown = parseSectorBreakdown($, topHoldings, warnings)
  const stockStyle = parseStockStyle($, warnings)
  const stockStats = parseStockStats($, header)
  const fees = parseFees($, header)
  const riskMeasures = parseRiskMeasures($, warnings)

  const navDateText =
    header["Date of Latest NAV"] ?? header["latestNavDate"] ?? ""
  const suggestedMonth = navDateText ? parseMonthFromNavDate(navDateText) : null
  if (!suggestedMonth && navDateText)
    warnings.push("Could not parse statement month from NAV date")

  const latestNavStr = header["Latest NAV"] ?? ""
  const latestNavNumeric = latestNavStr ? parseLatestNavNumber(latestNavStr) : null

  const performanceCurrency =
    header["Currency"] ?? header["currency"] ?? currencyId ?? null

  // Determine version: 2 if any new data was extracted, else 1 for compat
  const hasV2Data =
    calendarYearReturns != null ||
    trailingReturns != null ||
    sectorBreakdown != null ||
    stockStyle != null ||
    stockStats != null ||
    fees != null ||
    riskMeasures != null ||
    annualPerformance?.benchmarkValues != null

  const snapshot: IlpFundReportSnapshot = {
    version: hasV2Data ? 2 : 1,
    parserId: hasV2Data ? "tokio-morningstar-v2" : "tokio-morningstar-v1",
    extractedAt: new Date().toISOString(),
    msId,
    currencyId,
    performanceCurrency,
    snapshotUrl,
    investmentName,
    header,
    growthChartPresent,
    annualPerformanceTablePresent,
    trailingReturnsTablePresent,
    calendarYearReturnsPresent,
    annualPerformance,
    assetAllocation,
    topHoldings,
    calendarYearReturns,
    trailingReturns,
    sectorBreakdown,
    stockStyle,
    stockStats,
    fees,
    riskMeasures,
    warnings,
  }

  return {
    snapshot,
    suggestedMonth,
    latestNavNumeric,
  }
}
