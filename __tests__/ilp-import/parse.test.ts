import { readFileSync, existsSync, readdirSync } from "fs"
import { join } from "path"
import { describe, it, expect } from "vitest"
import { decodeQuotedPrintable } from "@/lib/ilp-import/quoted-printable"
import { extractFirstHtmlFromMhtml } from "@/lib/ilp-import/mhtml"
import { parseIlpFundReportMhtml } from "@/lib/ilp-import/index"

describe("quoted-printable", () => {
  it("decodes soft line breaks and hex bytes", () => {
    expect(decodeQuotedPrintable("a=3D")).toBe("a=")
    expect(decodeQuotedPrintable("hello=\r\n world")).toBe("hello world")
  })
})

describe("mhtml extraction", () => {
  it("extracts first html part from minimal multipart", () => {
    const raw = [
      "From: <Saved by Blink>",
      "Snapshot-Content-Location: https://example.com/x?currencyId=SGD#?id=F000TEST",
      "MIME-Version: 1.0",
      'Content-Type: multipart/related; boundary="abc"',
      "",
      "",
      "--abc",
      "Content-Type: text/html",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<!DOCTYPE html><p>hi=3Dthere</p>",
      "--abc--",
      "",
    ].join("\r\n")
    const { html, snapshotUrl, warnings } = extractFirstHtmlFromMhtml(raw)
    expect(warnings.length).toBe(0)
    expect(snapshotUrl).toContain("currencyId=SGD")
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("hi=there")
  })
})

const CORPUS_DIR = join(process.cwd(), "docs/ILP-pages")
const SAMPLE = join(CORPUS_DIR, "Amova Japan Dividend Equity Fund Dis SGD -H.mhtml")

describe("Tokio corpus (optional)", () => {
  it("parses Amova Japan sample when present", () => {
    if (!existsSync(SAMPLE)) return
    const raw = readFileSync(SAMPLE, "utf8")
    const r = parseIlpFundReportMhtml(raw, { sourceFile: "Amova Japan.mhtml" })
    expect(r.snapshot.investmentName).toContain("Amova Japan")
    expect(r.snapshot.msId).toBe("F00000Q3EG")
    expect(r.snapshot.currencyId).toBe("SGD")
    expect(r.snapshot.header["Latest NAV"]).toMatch(/\d/)
    expect(r.snapshot.assetAllocation?.length).toBeGreaterThan(0)
  })

  it("parses all .mhtml in docs/ILP-pages when present", () => {
    if (!existsSync(CORPUS_DIR)) return
    const files = readdirSync(CORPUS_DIR).filter((n: string) =>
      n.toLowerCase().endsWith(".mhtml"),
    )
    for (const f of files) {
      const raw = readFileSync(join(CORPUS_DIR, f), "utf8")
      const r = parseIlpFundReportMhtml(raw, { sourceFile: f })
      expect(r.snapshot.investmentName, f).toBeTruthy()
      expect(r.snapshot.msId, f).toBeTruthy()
    }
  })
})
