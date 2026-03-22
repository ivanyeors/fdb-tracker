/**
 * Client-side MHTML stripper.
 * Extracts only the first text/html MIME part and reconstructs a minimal MHTML,
 * preserving top-level headers so the server parse pipeline stays unchanged.
 * Reduces payload size by 60-80% by dropping embedded images, CSS, and JS.
 */

function extractBoundary(headerBlock: string): string | null {
  const joined = headerBlock.replace(/\r?\n[ \t]+/g, " ")
  const m = joined.match(
    /Content-Type:\s*multipart\/[^;]+;\s*[^]*?boundary\s*=\s*"([^"]+)"/i
  )
  if (m) return m[1].trim()
  const m2 = joined.match(/boundary\s*=\s*"([^"]+)"/i)
  if (m2) return m2[1].trim()
  const m3 = joined.match(/boundary\s*=\s*([^\s;]+)/i)
  return m3 ? m3[1].trim() : null
}

/**
 * Strip an MHTML file down to only its first text/html part.
 * Returns a valid (smaller) MHTML string that the server parser can process unchanged.
 * If parsing fails, returns the original string as a fallback.
 */
export function stripMhtmlToHtmlOnly(raw: string): string {
  // Split top-level headers from body
  const idx = raw.search(/\r\n\r\n|\n\n/)
  if (idx === -1) return raw

  const nl = raw[idx] === "\r" ? "\r\n" : "\n"
  const sepLen = nl.length * 2
  const topHeaders = raw.slice(0, idx)
  const body = raw.slice(idx + sepLen)

  const boundary = extractBoundary(topHeaders)
  if (!boundary) return raw

  // Split into MIME parts
  const delim = `${nl}--${boundary}`
  const parts = body.split(delim)
  if (parts.length <= 1) return raw

  // Find the first text/html part (parts[0] is preamble, actual parts start at index 1)
  for (let i = 1; i < parts.length; i++) {
    let chunk = parts[i]
    if (chunk.startsWith("--")) break // closing boundary

    // Strip leading newline
    chunk = chunk.replace(/^\r\n/, "").replace(/^\n/, "")

    const endIdx = chunk.search(/\r\n\r\n|\n\n/)
    if (endIdx === -1) continue

    const partHeaders = chunk.slice(0, endIdx)
    const ctMatch = partHeaders.match(/^Content-Type:\s*(.+)$/im)
    const contentType = ctMatch
      ? ctMatch[1].trim().split(";")[0]?.trim()
      : null
    if (contentType !== "text/html") continue

    // Found the HTML part — reconstruct a minimal MHTML
    const partBody = chunk.slice(endIdx + (chunk[endIdx] === "\r" ? 4 : 2))

    return [
      topHeaders,
      "", // blank line separating headers from body
      `--${boundary}`,
      partHeaders,
      "", // blank line separating part headers from part body
      partBody,
      `${nl}--${boundary}--`,
    ].join(nl)
  }

  // No text/html part found — return original
  return raw
}
