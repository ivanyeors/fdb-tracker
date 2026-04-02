import { extractText } from "unpdf"

export interface PdfParseResult {
  text: string
  pageCount: number
  /** Per-page text (preserves line breaks within each page). */
  pages: string[]
}

/**
 * Extract text content from a PDF buffer.
 * Uses unpdf which bundles a serverless-compatible PDF.js build
 * (no DOMMatrix or browser APIs required).
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const merged = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  })
  const perPage = await extractText(new Uint8Array(buffer), {
    mergePages: false,
  })
  return {
    text: merged.text,
    pageCount: merged.totalPages,
    pages: perPage.text as unknown as string[],
  }
}
