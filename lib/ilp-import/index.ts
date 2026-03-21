export { decodeQuotedPrintable } from "./quoted-printable"
export { extractFirstHtmlFromMhtml, extractTopSnapshotUrl } from "./mhtml"
export { parseTokioFundReportUrl } from "./parse-url"
export { parseTokioMorningstarHtml } from "./parse-tokio-morningstar"
export type {
  IlpFundReportParseResult,
  IlpFundReportSnapshot,
  IlpFundReportParserId,
} from "./types"

import { extractFirstHtmlFromMhtml } from "./mhtml"
import { parseTokioMorningstarHtml } from "./parse-tokio-morningstar"
import type { IlpFundReportParseResult } from "./types"

/**
 * Full pipeline: MHTML string → decoded HTML → Tokio/Morningstar parse result.
 */
export function parseIlpFundReportMhtml(
  rawMhtml: string,
  options?: { sourceFile?: string },
): IlpFundReportParseResult & { htmlWarnings: string[] } {
  const { html, snapshotUrl, warnings: htmlWarnings } =
    extractFirstHtmlFromMhtml(rawMhtml)
  if (!html || html.length === 0) {
    return {
      snapshot: {
        version: 1,
        parserId: "tokio-morningstar-v1",
        extractedAt: new Date().toISOString(),
        msId: null,
        currencyId: null,
        performanceCurrency: null,
        snapshotUrl,
        investmentName: null,
        header: {},
        growthChartPresent: false,
        annualPerformanceTablePresent: false,
        trailingReturnsTablePresent: false,
        calendarYearReturnsPresent: false,
        warnings: ["Empty HTML after MHTML extraction", ...htmlWarnings],
      },
      suggestedMonth: null,
      latestNavNumeric: null,
      htmlWarnings,
    }
  }
  const result = parseTokioMorningstarHtml(html, snapshotUrl, options)
  result.snapshot.warnings = [...htmlWarnings, ...result.snapshot.warnings]
  return { ...result, htmlWarnings }
}
