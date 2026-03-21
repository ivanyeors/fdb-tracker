import * as cheerio from "cheerio"
import { parseTopHoldingsTable } from "./parse-top-holdings"
import type { IlpFundReportParseResult, IlpFundReportSnapshot } from "./types"
import { parseTokioFundReportUrl } from "./parse-url"

function parseMonthFromNavDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const monStr = m[2].toLowerCase().slice(0, 3)
  const year = parseInt(m[3], 10)
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
  const t = text.replace(/,/g, "").trim()
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function normalizeCell(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
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

  const annualSec = $(`[section-id="annualPerformanceTable"]`).first()
  let annualPerformanceTablePresent = annualSec.length > 0
  let annualPerformance: IlpFundReportSnapshot["annualPerformance"]
  if (annualSec.length > 0) {
    const rows = annualSec.find("tr").toArray()
    if (rows.length >= 2) {
      const headerCells = $(rows[0])
        .find("th,td")
        .map((_, c) => normalizeCell($(c).text()))
        .get()
      const fundRow = $(rows[1])
        .find("th,td")
        .map((_, c) => normalizeCell($(c).text()))
        .get()
      const periodLabels = headerCells.slice(1)
      const fundValues = fundRow.slice(1).map((c) => (c.length > 0 ? c : null))
      annualPerformance = { periodLabels, fundValues }
    } else {
      annualPerformanceTablePresent = false
      warnings.push("annualPerformanceTable: expected at least 2 rows")
    }
  }

  const trailingReturnsTablePresent =
    $(`[section-id="trailingReturnsPanel"]`).find("tr").length > 0
  const calendarYearReturnsPresent =
    $(`[section-id="calendarYearReturns"]`).find("tr").length > 0

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
          .map((_, c) => normalizeCell($(c).text()))
          .get()
        if (cells.length < 2) return
        const label = cells[0]
        const w = parseFloat(cells[1].replace(/[−–-]/g, "-"))
        const cat =
          cells.length > 2 ? parseFloat(cells[2].replace(/[−–-]/g, "-")) : NaN
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

  const navDateText =
    header["Date of Latest NAV"] ?? header["latestNavDate"] ?? ""
  const suggestedMonth = navDateText ? parseMonthFromNavDate(navDateText) : null
  if (!suggestedMonth && navDateText)
    warnings.push("Could not parse statement month from NAV date")

  const latestNavStr = header["Latest NAV"] ?? ""
  const latestNavNumeric = latestNavStr ? parseLatestNavNumber(latestNavStr) : null

  const performanceCurrency =
    header["Currency"] ?? header["currency"] ?? currencyId ?? null

  const snapshot: IlpFundReportSnapshot = {
    version: 1,
    parserId: "tokio-morningstar-v1",
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
    warnings,
  }

  return {
    snapshot,
    suggestedMonth,
    latestNavNumeric,
  }
}
