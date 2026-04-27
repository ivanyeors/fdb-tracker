/**
 * Extract the first text/html part from a Chrome/Blink MHTML snapshot.
 * Multipart boundary is read from the top-level Content-Type header.
 */

import { decodeQuotedPrintable } from "./quoted-printable"

/** Top-level MIME headers before the first blank line + multipart body. */
export function extractTopSnapshotUrl(raw: string): string | null {
  const m = /^Snapshot-Content-Location:\s*(.+)$/im.exec(raw)
  if (!m) return null
  return m[1].trim().replace(/\r$/, "")
}

function extractBoundaryFromHeaders(headerBlock: string): string | null {
  const joined = headerBlock.replaceAll(/\r?\n[ \t]+/g, " ")
  const m = /Content-Type:\s*multipart\/[^;]+;\s*[^]*?boundary\s*=\s*"([^"]+)"/i.exec(joined)
  if (m) return m[1].trim()
  const m2 = /boundary\s*=\s*"([^"]+)"/i.exec(joined)
  if (m2) return m2[1].trim()
  const m3 = /boundary\s*=\s*([^\s;]+)/i.exec(joined)
  return m3 ? m3[1].trim() : null
}

function splitMimeHeaderAndBody(raw: string): { headers: string; body: string } | null {
  const idx = raw.search(/\r\n\r\n|\n\n/)
  if (idx === -1) return null
  const sepLen = raw[idx] === "\r" ? 4 : 2
  return {
    headers: raw.slice(0, idx),
    body: raw.slice(idx + sepLen),
  }
}

function parsePartHeaders(partHeaderBlock: string): {
  contentType: string | null
  transferEncoding: string | null
} {
  const lines = partHeaderBlock.split(/\r?\n/)
  let contentType: string | null = null
  let transferEncoding: string | null = null
  for (const line of lines) {
    const lm = /^Content-Type:\s*(.+)$/i.exec(line)
    if (lm) contentType = lm[1].trim().split(";")[0]?.trim() ?? null
    const te = /^Content-Transfer-Encoding:\s*(.+)$/i.exec(line)
    if (te) transferEncoding = te[1].trim().toLowerCase()
  }
  return { contentType, transferEncoding }
}

/**
 * Returns decoded HTML from the first multipart part with Content-Type text/html.
 */
export function extractFirstHtmlFromMhtml(raw: string): {
  html: string
  snapshotUrl: string | null
  warnings: string[]
} {
  const warnings: string[] = []
  const snapshotUrl = extractTopSnapshotUrl(raw)

  const hb = splitMimeHeaderAndBody(raw)
  if (!hb) {
    warnings.push("Could not split MIME headers from body")
    return { html: "", snapshotUrl, warnings }
  }

  const boundary = extractBoundaryFromHeaders(hb.headers)
  if (!boundary) {
    warnings.push("No multipart boundary; treating remainder as raw HTML")
    const html = decodeQuotedPrintable(hb.body)
    return { html, snapshotUrl, warnings }
  }

  const delim = `\r\n--${boundary}`
  const delimN = `\n--${boundary}`
  let parts = hb.body.split(delim)
  if (parts.length === 1) parts = hb.body.split(delimN)
  if (parts.length <= 1) {
    warnings.push("Boundary delimiter not found in body")
    return { html: "", snapshotUrl, warnings }
  }

  for (let i = 1; i < parts.length; i++) {
    let chunk = parts[i]
    if (chunk.startsWith("--")) break
    chunk = chunk.replace(/^\r\n/, "").replace(/^\n/, "")
    const endIdx = chunk.search(/\r\n\r\n|\n\n/)
    if (endIdx === -1) continue
    const ph = chunk.slice(0, endIdx)
    const pb = chunk.slice(endIdx + (chunk[endIdx] === "\r" ? 4 : 2))
    const { contentType, transferEncoding } = parsePartHeaders(ph)
    if (contentType !== "text/html") continue

    let body = pb
    if (body.endsWith(`\r\n--`)) body = body.replace(/\r\n--$/, "")
    if (body.endsWith(`\n--`)) body = body.replace(/\n--$/, "")

    const html =
      transferEncoding === "quoted-printable"
        ? decodeQuotedPrintable(body)
        : body
    return { html, snapshotUrl, warnings }
  }

  warnings.push("No text/html part found in multipart body")
  return { html: "", snapshotUrl, warnings }
}
