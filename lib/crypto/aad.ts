export interface CryptoContext {
  table: string
  column: string
}

export function buildAad(ctx: CryptoContext): Buffer {
  if (!ctx.table || !ctx.column) {
    throw new Error("CryptoContext requires non-empty table and column")
  }
  return Buffer.from(`${ctx.table}:${ctx.column}`, "utf8")
}
