/**
 * Batch-parse Tokio Marine fund report MHTML files under docs/ILP-pages/.
 * Usage: npx tsx scripts/parse-ilp-mhtml.ts [--dir docs/ILP-pages] [--out docs/ILP-pages/parsed]
 */
import { readdir, readFile, mkdir, writeFile } from "fs/promises"
import { join, resolve } from "path"
import { parseIlpFundReportMhtml } from "../lib/ilp-import/index"

async function main() {
  const args = process.argv.slice(2)
  let dir = resolve("docs/ILP-pages")
  let outDir = resolve("docs/ILP-pages/parsed")
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      dir = resolve(args[++i])
    } else if (args[i] === "--out" && args[i + 1]) {
      outDir = resolve(args[++i])
    }
  }

  await mkdir(outDir, { recursive: true })
  const names = (await readdir(dir)).filter(
    (n) => n.toLowerCase().endsWith(".mhtml") || n.toLowerCase().endsWith(".mht"),
  )

  type FileSummary = {
    file: string
    msId: string | null
    currencyId: string | null
    investmentName: string | null
    warningCount: number
    ok: boolean
    keys: string[]
  }

  const summaries: FileSummary[] = []
  const allKeySets: string[][] = []

  for (const name of names.sort()) {
    const filePath = join(dir, name)
    const raw = await readFile(filePath, "utf8")
    const result = parseIlpFundReportMhtml(raw, { sourceFile: name })
    const { snapshot } = result
    const base = name.replace(/\.mhtml?$/i, "")
    const jsonPath = join(outDir, `${base}.json`)
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          sourceFile: name,
          suggestedMonth: result.suggestedMonth,
          latestNavNumeric: result.latestNavNumeric,
          snapshot,
        },
        null,
        2,
      ),
      "utf8",
    )

    const keys = Object.keys(snapshot.header).sort((a, b) =>
      a.localeCompare(b)
    )
    allKeySets.push(keys)
    summaries.push({
      file: name,
      msId: snapshot.msId,
      currencyId: snapshot.currencyId,
      investmentName: snapshot.investmentName,
      warningCount: snapshot.warnings.length,
      ok: snapshot.warnings.length === 0 || snapshot.investmentName != null,
      keys,
    })
  }

  const intersection =
    allKeySets.length === 0
      ? []
      : allKeySets
          .slice(1)
          .reduce((acc, k) => acc.filter((x) => k.includes(x)), allKeySets[0]!)
  const union = [...new Set(allKeySets.flat())].sort((a, b) =>
    a.localeCompare(b)
  )

  const summaryPath = join(outDir, "summary.json")
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputDir: dir,
        fileCount: names.length,
        files: summaries,
        headerKeysUnion: union,
        headerKeysIntersection: intersection,
      },
      null,
      2,
    ),
    "utf8",
  )

  console.log(`Parsed ${names.length} file(s) → ${outDir}`)
  console.log(`Summary: ${summaryPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
