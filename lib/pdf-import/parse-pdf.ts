import { extractText } from "unpdf"

export interface PdfParseResult {
  text: string
  pageCount: number
}

/**
 * Extract text content from a PDF buffer.
 * Uses unpdf which bundles a serverless-compatible PDF.js build
 * (no DOMMatrix or browser APIs required).
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const result = await extractText(new Uint8Array(buffer), { mergePages: true })
  return {
    text: result.text,
    pageCount: result.totalPages,
  }
}
