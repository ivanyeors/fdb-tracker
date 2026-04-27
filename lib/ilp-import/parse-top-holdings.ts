import type * as cheerio from "cheerio"
import type { IlpTopHoldingRow } from "./types"

function normalizeCell(s: string): string {
  return s.replaceAll(/\u00a0/g, " ").replaceAll(/\s+/g, " ").trim()
}

/** Sector/country cells often show an em dash or similar when unknown. */
function cellToOptionalText(raw: string): string | null {
  const t = normalizeCell(raw)
  if (t.length === 0) return null
  if (/^[−–—\u2013\u2014\-–—]\s*$/.test(t)) return null
  if (t === "—" || t === "–" || t === "-") return null
  return t
}

/**
 * Portfolio holdings table (Morningstar `topTenHoldingsTable` component).
 * Columns: rank, Security Name, Sector, Country, % of assets (typical).
 */
export function parseTopHoldingsTable(
  $: cheerio.CheerioAPI,
): IlpTopHoldingRow[] | undefined {
  const container = $('[mstar-component-id="topTenHoldingsTable"]').first()
  if (!container.length) return undefined

  const tbody = container.find("tbody").first()
  if (!tbody.length) return undefined

  const rows: IlpTopHoldingRow[] = []

  tbody.find("tr").each((_, tr) => {
    const tds = $(tr).find("> td")
    if (tds.length < 5) return

    const rankText = normalizeCell(
      $(tds[0]).find(".ec-table__cell-content").first().text() ||
        $(tds[0]).text(),
    )
    const rankParsed = Number.parseInt(rankText, 10)
    const rank = Number.isFinite(rankParsed) ? rankParsed : null

    const nameText = normalizeCell(
      $(tds[1]).find(".ec-table__cell-content").first().text() ||
        $(tds[1]).text(),
    )
    if (!nameText) return

    const sectorRaw =
      $(tds[2]).find(".ec-table__cell-content").first().text() ||
      $(tds[2]).text()
    const sector = cellToOptionalText(sectorRaw)

    const countryRaw =
      $(tds[3]).find(".ec-table__cell-content").first().text() ||
      $(tds[3]).text()
    const country = cellToOptionalText(countryRaw)

    const wText = normalizeCell(
      $(tds[4]).find(".ec-table__cell-content").first().text() ||
        $(tds[4]).text(),
    )
    const w = Number.parseFloat(wText.replaceAll(/,/g, ""))
    const weightPct = Number.isFinite(w) ? w : null

    rows.push({
      rank,
      securityName: nameText,
      sector,
      country,
      weightPct,
    })
  })

  return rows.length > 0 ? rows : undefined
}
