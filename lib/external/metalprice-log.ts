/** Safe string for logs when MetalpriceAPI returns error/message as objects. */
export function metalpriceApiDetail(data: Record<string, unknown>): string {
  const keys = ["error", "message", "info"] as const
  const parts: string[] = []
  for (const k of keys) {
    const v = data[k]
    if (v == null) continue
    if (typeof v === "string") {
      parts.push(v)
      continue
    }
    if (typeof v === "number" || typeof v === "boolean") {
      parts.push(String(v))
      continue
    }
    try {
      parts.push(JSON.stringify(v))
    } catch {
      parts.push(String(v))
    }
  }
  return parts.join(" — ") || "missing rates"
}
