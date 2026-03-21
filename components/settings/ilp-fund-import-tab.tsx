"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { useActiveProfile } from "@/hooks/use-active-profile"
import type { IlpFundReportSnapshot } from "@/lib/ilp-import/types"

type Step = "idle" | "extracting" | "preview" | "saving" | "success"

type ParseResponse = {
  suggestedMonth: string | null
  latestNavNumeric: number | null
  snapshot: IlpFundReportSnapshot
}

type IlpProductRow = { id: string; name: string }

export function IlpFundImportTab({ familyId: familyIdProp }: { familyId: string | null }) {
  const { activeFamilyId } = useActiveProfile()
  const familyId = activeFamilyId ?? familyIdProp

  const [step, setStep] = useState<Step>("idle")
  const [fileLabel, setFileLabel] = useState<string | null>(null)
  const [fileRef, setFileRef] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null)
  const [products, setProducts] = useState<IlpProductRow[]>([])
  const [productId, setProductId] = useState<string>("")
  const [month, setMonth] = useState("")
  const [fundValue, setFundValue] = useState<number | null>(null)
  const [premiumsPaid, setPremiumsPaid] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)

  const loadProducts = useCallback(async () => {
    if (!familyId) return
    const res = await fetch(`/api/investments/ilp?familyId=${familyId}`)
    if (!res.ok) return
    const data = (await res.json()) as { id: string; name: string }[]
    setProducts(Array.isArray(data) ? data : [])
  }, [familyId])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const resetFlow = useCallback(() => {
    setStep("idle")
    setFileLabel(null)
    setFileRef(null)
    setParseResult(null)
    setProductId("")
    setMonth("")
    setFundValue(null)
    setPremiumsPaid(null)
    setProgress(0)
  }, [])

  const onPickFile = (file: File | null) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".mhtml") && !lower.endsWith(".mht")) {
      toast.error("Please choose a .mhtml or .mht file (Chrome “Webpage, single file”).")
      return
    }
    setFileRef(file)
    setFileLabel(file.name)
    setParseResult(null)
    setStep("idle")
  }

  const handleExtract = async () => {
    if (!fileRef) {
      toast.error("Choose a fund report file first.")
      return
    }
    setStep("extracting")
    try {
      const fd = new FormData()
      fd.set("file", fileRef)
      const res = await fetch("/api/investments/ilp/fund-report/parse", {
        method: "POST",
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Parse failed")
      }
      const data = (await res.json()) as ParseResponse
      setParseResult(data)
      if (data.suggestedMonth) setMonth(data.suggestedMonth)
      setFundValue(null)
      await loadProducts()
      setStep("preview")
      toast.success("Fund report extracted — review and confirm below.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extract failed")
      setStep("idle")
    }
  }

  const handleCommit = async () => {
    if (!familyId) {
      toast.error("No family context — open Setup from a logged-in session.")
      return
    }
    if (!parseResult?.snapshot) {
      toast.error("Nothing to save. Extract a file first.")
      return
    }
    if (!productId) {
      toast.error("Select an ILP product.")
      return
    }
    if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(month)) {
      toast.error("Choose a valid statement month.")
      return
    }
    const fv = fundValue ?? 0
    if (fv < 0) {
      toast.error("Fund value must be zero or positive.")
      return
    }

    setStep("saving")
    setProgress(15)
    try {
      const res = await fetch("/api/investments/ilp/fund-report/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          familyId,
          month,
          fundValue: fv,
          premiumsPaid,
          snapshot: parseResult.snapshot,
        }),
      })
      setProgress(85)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      setProgress(100)
      setStep("success")
      toast.success("ILP entry saved.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
      setStep("preview")
    } finally {
      setProgress(0)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) onPickFile(f)
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">ILP fund report import</CardTitle>
        <CardDescription>
          Save a Tokio Marine fund page as{" "}
          <strong>Webpage, single file</strong> in Chrome, then drop the .mhtml here.
          The file is processed in memory only and is not stored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!familyId ? (
          <p className="text-sm text-muted-foreground">
            Add a family in onboarding or user settings to import against an ILP product.
          </p>
        ) : null}

        {step !== "success" ? (
          <>
            <div
              className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-6 text-center transition-colors hover:bg-muted/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => document.getElementById("ilp-mhtml-input")?.click()}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop .mhtml here, or click to browse
              </p>
              {fileLabel ? (
                <p className="text-xs font-medium text-foreground">{fileLabel}</p>
              ) : null}
              <input
                id="ilp-mhtml-input"
                type="file"
                accept=".mhtml,.mht,text/html"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!fileRef || step === "extracting"}
                onClick={() => void handleExtract()}
              >
                {step === "extracting" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Extracting…
                  </>
                ) : (
                  "Extract"
                )}
              </Button>
              {(fileRef || parseResult) && step !== "extracting" ? (
                <Button type="button" variant="ghost" size="sm" onClick={resetFlow}>
                  Clear
                </Button>
              ) : null}
            </div>
          </>
        ) : null}

        {step === "saving" ? (
          <div className="space-y-2">
            <Label>Saving</Label>
            <Progress value={progress} className="h-2" />
          </div>
        ) : null}

        {parseResult && step !== "success" ? (
          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div>
              <h4 className="text-sm font-medium">Parsed summary</h4>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">Fund</dt>
                  <dd>{parseResult.snapshot.investmentName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">MS ID</dt>
                  <dd>{parseResult.snapshot.msId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Currency</dt>
                  <dd>{parseResult.snapshot.currencyId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Latest NAV (from report)</dt>
                  <dd>
                    {parseResult.latestNavNumeric != null
                      ? String(parseResult.latestNavNumeric)
                      : "—"}
                  </dd>
                </div>
              </dl>
              {parseResult.snapshot.warnings.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-amber-600 dark:text-amber-400">
                  {parseResult.snapshot.warnings.slice(0, 6).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>ILP product</Label>
              <Select
                value={productId || undefined}
                onValueChange={(v) => setProductId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select policy" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {products.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No ILP products yet — add one under Investments → ILP first.
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Statement month</Label>
              <MonthYearPicker
                value={month || null}
                onChange={(d) => setMonth(d ?? "")}
                placeholder="YYYY-MM from report"
                className="w-full max-w-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Total fund value (SGD)</Label>
              <CurrencyInput
                placeholder="0.00"
                value={fundValue}
                onChange={(v) => setFundValue(v)}
              />
              <p className="text-xs text-muted-foreground">
                Use your policy total fund value for this month (not NAV per unit).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Premiums paid to date (optional)</Label>
              <CurrencyInput
                placeholder="Optional"
                value={premiumsPaid}
                onChange={(v) => setPremiumsPaid(v)}
              />
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={step === "saving" || !productId}
              onClick={() => void handleCommit()}
            >
              {step === "saving" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Confirm and save"
              )}
            </Button>
          </div>
        ) : null}

        {step === "success" ? (
          <div className="space-y-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-sm font-medium text-foreground">Import saved</p>
            <p className="text-sm text-muted-foreground">
              Your ILP entry and fund report snapshot are stored. View them on the
              Investments page under the ILP tab.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/investments?tab=ilp">View Investments — ILP</Link>
              </Button>
              <Button type="button" variant="outline" onClick={resetFlow}>
                Import another file
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
