/**
 * Decode quoted-printable (RFC 2045) to a UTF-8 string.
 * Handles soft line breaks (=\r\n) and hex byte sequences (=3D, etc.).
 */
export function decodeQuotedPrintable(input: string): string {
  const withoutSoftBreaks = input.replace(/=\r?\n/g, "")
  const bytes: number[] = []
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    const c = withoutSoftBreaks[i]
    if (c === "=" && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16))
        i += 2
        continue
      }
    }
    bytes.push(c.charCodeAt(0) & 0xff)
  }
  return Buffer.from(bytes).toString("utf8")
}
