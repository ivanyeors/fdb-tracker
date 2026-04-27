/** Parse MSID and currency from Tokio fund report snapshot URL. */
export function parseTokioFundReportUrl(url: string | null): {
  msId: string | null
  currencyId: string | null
} {
  if (!url || typeof url !== "string") return { msId: null, currencyId: null }
  let msId: string | null = null
  let currencyId: string | null = null
  const cur = /[?&]currencyId=([^&#]+)/i.exec(url)
  if (cur) {
    try {
      currencyId = decodeURIComponent(cur[1].trim()) || null
    } catch {
      currencyId = cur[1].trim() || null
    }
  }
  const afterHash = url.split("#")[1] ?? ""
  const idInHash = /[?&]id=([^&#]+)/i.exec(afterHash)
  const idInQuery = /[?&]id=([^&#]+)/i.exec(url)
  const raw = idInHash?.[1] ?? idInQuery?.[1]
  if (raw) {
    try {
      msId = decodeURIComponent(raw.trim()) || null
    } catch {
      msId = raw.trim() || null
    }
  }
  return { msId, currencyId }
}
