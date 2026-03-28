import { PDFParse } from "pdf-parse"

export interface PdfParseResult {
  text: string
  pageCount: number
}

/**
 * Extract text content from a PDF buffer.
 * Returns the full text and page count.
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const textResult = await parser.getText()
  return {
    text: textResult.text,
    pageCount: textResult.total,
  }
}
