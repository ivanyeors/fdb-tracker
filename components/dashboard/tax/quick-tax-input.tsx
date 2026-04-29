"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CurrencyInput } from "@/components/ui/currency-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, FileText, Upload } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"

interface QuickTaxInputProps {
  readonly year: number
  readonly profiles: Array<{ id: string; name: string }>
  readonly onSuccess: () => void
}

export function QuickTaxInput({
  year,
  profiles,
  onSuccess,
}: QuickTaxInputProps) {
  const [taxAmount, setTaxAmount] = useState(0)
  const [selectedProfileId, setSelectedProfileId] = useState(
    profiles[0]?.id ?? ""
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (taxAmount <= 0 || !selectedProfileId) return

    setIsLoading(true)
    try {
      // Save via the import endpoint which also creates GIRO schedule
      const res = await fetch("/api/tax/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: selectedProfileId,
          year,
          tax_payable: taxAmount,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      toast.success(
        `YA ${year} tax saved: $${formatCurrency(taxAmount)}. GIRO schedule calculated.`
      )
      onSuccess()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save tax amount"
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file")
      return
    }

    setIsUploading(true)
    try {
      // Parse PDF
      const formData = new FormData()
      formData.append("file", file)
      const parseRes = await fetch("/api/statements/parse", {
        method: "POST",
        body: formData,
      })
      const parseData = await parseRes.json().catch(() => ({}))
      if (!parseRes.ok)
        throw new Error(parseData.error ?? "Failed to parse PDF")

      if (parseData.classification?.type !== "tax_noa") {
        toast.error(
          "This doesn't appear to be an IRAS Notice of Assessment. Please upload your NOA PDF."
        )
        return
      }

      const extracted = parseData.extracted
      if (!extracted?.year || !extracted?.taxPayable) {
        toast.error(
          "Could not extract tax details from this PDF. Try entering the amount manually."
        )
        return
      }

      // Auto-save via import endpoint
      const importRes = await fetch("/api/tax/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: selectedProfileId,
          year: extracted.year,
          tax_payable: extracted.taxPayable,
          employment_income: extracted.employmentIncome,
          chargeable_income: extracted.chargeableIncome,
          total_deductions: extracted.totalDeductions,
          donations_deduction: extracted.donationsDeduction,
          reliefs_total: extracted.reliefsTotal,
          payment_due_date: extracted.paymentDueDate,
          reliefs: extracted.reliefs ?? [],
          bracket_summary: extracted.bracketSummary ?? [],
          is_on_giro: extracted.isOnGiro ?? false,
        }),
      })
      const importData = await importRes.json().catch(() => ({}))
      if (!importRes.ok)
        throw new Error(importData.error ?? "Failed to import NOA data")

      toast.success(
        `YA ${extracted.year} NOA imported: $${formatCurrency(extracted.taxPayable)} tax. Reliefs and GIRO auto-populated.`
      )
      onSuccess()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload PDF"
      )
    } finally {
      setIsUploading(false)
      // Reset input
      e.target.value = ""
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Got your IRAS assessment?
        </CardTitle>
        <CardDescription>
          Upload your NOA PDF for automatic extraction, or enter the tax payable
          amount. We&apos;ll calculate GIRO schedule and compare against our
          estimate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {/* PDF Upload */}
          <div className="space-y-2">
            <Label className="text-sm">Upload NOA PDF</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50">
              <Upload className="size-4" />
              {isUploading ? "Processing..." : "Choose PDF"}
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handlePdfUpload}
                disabled={isUploading}
              />
            </label>
          </div>

          <div className="flex items-center text-sm text-muted-foreground">
            or
          </div>

          {/* Manual quick entry */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
          >
            {profiles.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm">Profile</Label>
                <Select
                  value={selectedProfileId}
                  onValueChange={setSelectedProfileId}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <Label className="text-sm">Tax Payable ($)</Label>
              <CurrencyInput
                value={taxAmount}
                onChange={(v) => setTaxAmount(v ?? 0)}
                placeholder="e.g. 1,694.50"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading || taxAmount <= 0}
              className="shrink-0"
            >
              {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
