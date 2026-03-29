"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Upload, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ResponsiveSheet as Sheet,
  ResponsiveSheetContent as SheetContent,
  ResponsiveSheetDescription as SheetDescription,
  ResponsiveSheetFooter as SheetFooter,
  ResponsiveSheetHeader as SheetHeader,
  ResponsiveSheetTitle as SheetTitle,
} from "@/components/ui/responsive-sheet"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { stripMhtmlToHtmlOnly } from "@/lib/ilp-import/strip-mhtml-client"
import type { IlpFundReportSnapshot } from "@/lib/ilp-import/types"
import {
  allocationSumMessage,
  applySwitchOutZero,
  isValidIlpGroupAllocationSum,
  sumAllocationPcts,
} from "@/lib/investments/ilp-group-allocation"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export type IlpGroupProductForEdit = {
  id: string
  name: string
  group_allocation_pct: number | null
  fundValue: number
}

interface IlpGroupFundsEditSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
  groupPremiumAmount: number | null
  premiumPaymentMode: "monthly" | "one_time"
  products: IlpGroupProductForEdit[]
  onSuccess: () => void
}

type Row = {
  productId: string
  name: string
  fundValue: number
  allocationPct: number
}

export function IlpGroupFundsEditSheet({
  open,
  onOpenChange,
  groupId,
  groupName,
  groupPremiumAmount,
  premiumPaymentMode: initialPremiumMode,
  products,
  onSuccess,
}: IlpGroupFundsEditSheetProps) {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [rows, setRows] = useState<Row[]>([])
  const [groupPremium, setGroupPremium] = useState<number | null>(null)
  const [premiumMode, setPremiumMode] = useState<"monthly" | "one_time">(
    "monthly",
  )
  const [topUpDelta, setTopUpDelta] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)

  const [addName, setAddName] = useState("")
  const [addEndDate, setAddEndDate] = useState("")
  const [addingFund, setAddingFund] = useState(false)

  // Upload-from-report state
  const [addMode, setAddMode] = useState<"manual" | "upload">("manual")
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadStep, setUploadStep] = useState<"idle" | "extracting" | "extracted">("idle")
  const [uploadParse, setUploadParse] = useState<{
    snapshot: IlpFundReportSnapshot
    suggestedMonth: string | null
    latestNavNumeric: number | null
  } | null>(null)
  const [uploadMonth, setUploadMonth] = useState("")
  const [uploadFundValue, setUploadFundValue] = useState<number | null>(null)
  const [uploadPremiumsPaid, setUploadPremiumsPaid] = useState<number | null>(null)

  const syncFromProps = useCallback(() => {
    setRows(
      products.map((p) => ({
        productId: p.id,
        name: p.name,
        fundValue: p.fundValue,
        allocationPct:
          p.group_allocation_pct != null &&
          Number.isFinite(Number(p.group_allocation_pct))
            ? Number(p.group_allocation_pct)
            : 0,
      })),
    )
    setGroupPremium(
      groupPremiumAmount != null && Number.isFinite(Number(groupPremiumAmount))
        ? Number(groupPremiumAmount)
        : 0,
    )
    setPremiumMode(initialPremiumMode)
    setTopUpDelta(null)
  }, [products, groupPremiumAmount, initialPremiumMode])

  useEffect(() => {
    if (open) syncFromProps()
  }, [open, syncFromProps])

  const allocationSum = useMemo(
    () => sumAllocationPcts(rows.map((r) => r.allocationPct)),
    [rows],
  )
  const allocationOk = isValidIlpGroupAllocationSum(allocationSum)

  function updatePct(productId: string, raw: string) {
    const v = parseFloat(raw)
    const pct = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId ? { ...r, allocationPct: pct } : r,
      ),
    )
  }

  function handleSwitchOut(productId: string) {
    const items = rows.map((r) => ({
      productId: r.productId,
      allocationPct: r.allocationPct,
    }))
    const next = applySwitchOutZero(items, productId)
    const m = new Map(next.map((x) => [x.productId, x.allocationPct]))
    setRows((prev) =>
      prev.map((r) => ({ ...r, allocationPct: m.get(r.productId) ?? r.allocationPct })),
    )
  }

  function applyTopUp() {
    const d = topUpDelta ?? 0
    if (d === 0) return
    setGroupPremium((g) => (g ?? 0) + d)
    setTopUpDelta(null)
    toast.success("Added to group premium total")
  }

  async function handleSave() {
    if (!activeFamilyId) {
      toast.error("Please select a family first.")
      return
    }
    if (!allocationOk) {
      toast.error(allocationSumMessage(allocationSum))
      return
    }
    const gp = groupPremium ?? 0
    if (premiumMode === "monthly" && gp <= 0) {
      toast.error("Enter a positive group premium total for monthly mode.")
      return
    }

    setSaving(true)
    try {
      const items = rows.map((r) => ({
        productId: r.productId,
        allocationPct: r.allocationPct,
      }))
      const res = await fetch(`/api/investments/ilp/groups/${groupId}/allocations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: activeFamilyId,
          items,
          groupPremiumAmount: gp,
          premiumPaymentMode: premiumMode,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(
          typeof err.error === "string" ? err.error : "Failed to save group",
        )
      }
      toast.success("Group funds updated")
      onSuccess()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  function resetUpload() {
    setUploadFile(null)
    setUploadStep("idle")
    setUploadParse(null)
    setUploadMonth("")
    setUploadFundValue(null)
    setUploadPremiumsPaid(null)
  }

  function onPickUploadFile(list: FileList | null) {
    if (!list?.length) return
    const f = Array.from(list).find((f) => {
      const lower = f.name.toLowerCase()
      return lower.endsWith(".mhtml") || lower.endsWith(".mht")
    })
    if (!f) {
      toast.error("Please choose a .mhtml or .mht file.")
      return
    }
    setUploadFile(f)
    setUploadStep("idle")
    setUploadParse(null)
  }

  async function handleExtractUpload() {
    if (!uploadFile) {
      toast.error("Choose a fund report file first.")
      return
    }
    setUploadStep("extracting")
    try {
      const rawText = await uploadFile.text()
      const stripped = stripMhtmlToHtmlOnly(rawText)
      const slimFile = new File([stripped], uploadFile.name, { type: uploadFile.type })
      const fd = new FormData()
      fd.set("file", slimFile)
      const res = await fetch("/api/investments/ilp/fund-report/parse", {
        method: "POST",
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Parse failed for ${uploadFile.name}`)
      }
      const data = (await res.json()) as {
        suggestedMonth: string | null
        latestNavNumeric: number | null
        snapshot: IlpFundReportSnapshot
      }
      setUploadParse(data)
      setUploadStep("extracted")
      if (data.snapshot.investmentName) setAddName(data.snapshot.investmentName)
      if (data.suggestedMonth) setUploadMonth(data.suggestedMonth)
      toast.success("Fund report extracted — review and confirm below.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extract failed")
      setUploadStep("idle")
    }
  }

  async function handleAddFundSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeFamilyId) {
      toast.error("Please select a family first.")
      return
    }
    if (!addName.trim()) {
      toast.error("Enter a fund name.")
      return
    }
    if (!addEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(addEndDate)) {
      toast.error("Choose a valid premium end date.")
      return
    }

    setAddingFund(true)
    try {
      const res = await fetch("/api/investments/ilp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          monthlyPremium: 0,
          premiumPaymentMode: "one_time",
          endDate: addEndDate,
          ...(activeProfileId && { profileId: activeProfileId }),
          ...(!activeProfileId && activeFamilyId && { familyId: activeFamilyId }),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.error === "string" ? err.error : "Failed to add fund")
      }
      const created = (await res.json()) as { id: string; name: string }

      // If added from upload, also commit the fund report entry
      if (addMode === "upload" && uploadParse) {
        const commitRes = await fetch("/api/investments/ilp/fund-report/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: created.id,
            familyId: activeFamilyId,
            month: uploadMonth || uploadParse.suggestedMonth || "",
            fundValue: uploadFundValue ?? 0,
            premiumsPaid: uploadPremiumsPaid,
            snapshot: uploadParse.snapshot,
          }),
        })
        if (!commitRes.ok) {
          // Product was created but report commit failed — still add to list
          toast.error("Fund created but report entry failed to save.")
        }
      }

      setRows((prev) => [
        ...prev,
        {
          productId: created.id,
          name: created.name,
          fundValue: addMode === "upload" ? (uploadFundValue ?? 0) : 0,
          allocationPct: 0,
        },
      ])
      setAddName("")
      setAddEndDate("")
      resetUpload()
      toast.success("Fund added. Adjust allocations to total 100%, then save.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAddingFund(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !activeFamilyId) return
    const removedId = deleteTarget.id
    setDeletingId(removedId)
    try {
      const res = await fetch(`/api/investments/ilp/${removedId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: activeFamilyId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.error === "string" ? err.error : "Failed to delete")
      }
      toast.success("Fund removed from group")
      setDeleteTarget(null)
      setRows((prev) => prev.filter((r) => r.productId !== removedId))
      onSuccess()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-4xl"
        >
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle>Edit group funds — {groupName}</SheetTitle>
            <SheetDescription>
              Allocations must total 100%. Group premium is split across funds by
              allocation %. Switch out sets a fund to 0% and keeps its tracked value.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 p-4">
            <div className="space-y-3">
              <Label className="text-foreground">Group premium</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ilp-group-premium-total" className="text-muted-foreground">
                    Total ($)
                  </Label>
                  <CurrencyInput
                    id="ilp-group-premium-total"
                    placeholder="0.00"
                    value={groupPremium}
                    onChange={(v) => setGroupPremium(v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ilp-group-premium-mode">Payment</Label>
                  <Select
                    value={premiumMode}
                    onValueChange={(v) => setPremiumMode(v as "monthly" | "one_time")}
                  >
                    <SelectTrigger id="ilp-group-premium-mode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly (recurring)</SelectItem>
                      <SelectItem value="one_time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px] flex-1 space-y-1.5">
                  <Label htmlFor="ilp-group-topup" className="text-muted-foreground">
                    Add to total ($)
                  </Label>
                  <CurrencyInput
                    id="ilp-group-topup"
                    placeholder="0.00"
                    value={topUpDelta}
                    onChange={(v) => setTopUpDelta(v)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mb-0.5"
                  onClick={applyTopUp}
                >
                  Apply top-up
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-foreground">Allocations (%)</Label>
                <span
                  className={
                    allocationOk
                      ? "text-xs text-muted-foreground"
                      : "text-xs font-medium text-destructive"
                  }
                >
                  Total {allocationSum.toFixed(2)}%
                  {!allocationOk ? ` — ${allocationSumMessage(allocationSum)}` : ""}
                </span>
              </div>
              <div className="rounded-lg border border-border">
                {rows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No funds in this group.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {rows.map((r) => (
                      <li
                        key={r.productId}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Fund value ${r.fundValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step={0.01}
                            min={0}
                            max={100}
                            className="h-9 w-24"
                            value={Number.isFinite(r.allocationPct) ? r.allocationPct : ""}
                            onChange={(e) => updatePct(r.productId, e.target.value)}
                            aria-label={`Allocation % for ${r.name}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleSwitchOut(r.productId)}
                          >
                            Switch out
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setDeleteTarget({ id: r.productId, name: r.name })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Add fund to group</p>
                <div className="flex gap-1 rounded-lg border bg-muted/50 p-0.5">
                  <button
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      addMode === "manual"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setAddMode("manual")}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      addMode === "upload"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setAddMode("upload")}
                  >
                    From report
                  </button>
                </div>
              </div>

              {addMode === "manual" ? (
                <form onSubmit={handleAddFundSubmit} className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Creates a new ILP product, then include it in the allocation list and
                    save when percentages total 100%.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="ilp-add-fund-name">Name</Label>
                      <Input
                        id="ilp-add-fund-name"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        placeholder="Fund name"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Premium end date</Label>
                      <DatePicker
                        value={addEndDate || null}
                        onChange={(d) => setAddEndDate(d ?? "")}
                        placeholder="End date"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={addingFund}
                  >
                    {addingFund ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 size-4" />
                    )}
                    Add fund
                  </Button>
                </form>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Upload a Tokio Marine fund report (.mhtml) to extract fund details
                    automatically.
                  </p>

                  {uploadStep !== "extracted" ? (
                    <>
                      <div
                        className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-4 text-center transition-colors hover:bg-muted/50"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          onPickUploadFile(e.dataTransfer.files)
                        }}
                        onClick={() =>
                          document
                            .getElementById("ilp-group-mhtml-input")
                            ?.click()
                        }
                      >
                        <Upload className="size-6 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          Drop .mhtml file or click to browse
                        </p>
                        {uploadFile ? (
                          <p className="text-xs font-medium text-foreground">
                            {uploadFile.name}
                          </p>
                        ) : null}
                        <input
                          id="ilp-group-mhtml-input"
                          type="file"
                          accept=".mhtml,.mht,text/html"
                          className="hidden"
                          onChange={(e) => onPickUploadFile(e.target.files)}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!uploadFile || uploadStep === "extracting"}
                          onClick={() => void handleExtractUpload()}
                        >
                          {uploadStep === "extracting" ? (
                            <>
                              <Loader2 className="mr-2 size-4 animate-spin" />
                              Extracting…
                            </>
                          ) : (
                            "Extract"
                          )}
                        </Button>
                        {uploadFile ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={resetUpload}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {uploadStep === "extracted" && uploadParse ? (
                    <form
                      onSubmit={handleAddFundSubmit}
                      className="space-y-3"
                    >
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-medium">
                            Parsed summary
                          </h4>
                          <button
                            type="button"
                            className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                            title="Clear upload"
                            onClick={resetUpload}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <dl className="mt-1.5 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>
                            <dt className="font-medium text-foreground">
                              Fund
                            </dt>
                            <dd>
                              {uploadParse.snapshot.investmentName ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-foreground">
                              MS ID
                            </dt>
                            <dd>{uploadParse.snapshot.msId ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-foreground">
                              Currency
                            </dt>
                            <dd>
                              {uploadParse.snapshot.currencyId ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-foreground">
                              Latest NAV
                            </dt>
                            <dd>
                              {uploadParse.latestNavNumeric != null
                                ? String(uploadParse.latestNavNumeric)
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                        {uploadParse.snapshot.warnings.length > 0 ? (
                          <ul className="mt-1.5 list-inside list-disc text-xs text-amber-600 dark:text-amber-400">
                            {uploadParse.snapshot.warnings
                              .slice(0, 4)
                              .map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                          </ul>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ilp-upload-fund-name">Name</Label>
                        <Input
                          id="ilp-upload-fund-name"
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
                          placeholder="Fund name"
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Premium end date</Label>
                        <DatePicker
                          value={addEndDate || null}
                          onChange={(d) => setAddEndDate(d ?? "")}
                          placeholder="End date"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Statement month</Label>
                        <MonthYearPicker
                          value={uploadMonth || null}
                          onChange={(d) => setUploadMonth(d ?? "")}
                          placeholder="YYYY-MM from report"
                          className="w-full max-w-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Total fund value (SGD)</Label>
                        <CurrencyInput
                          placeholder="0.00"
                          value={uploadFundValue}
                          onChange={(v) => setUploadFundValue(v)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use your policy total fund value for this month.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Premiums paid to date (optional)</Label>
                        <CurrencyInput
                          placeholder="Optional"
                          value={uploadPremiumsPaid}
                          onChange={(v) => setUploadPremiumsPaid(v)}
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={addingFund}
                      >
                        {addingFund ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 size-4" />
                        )}
                        Add fund
                      </Button>
                    </form>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="mt-auto border-t p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !allocationOk || rows.length === 0}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save group
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove fund from group?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.name}</span> will
              be deleted and its monthly history removed. Remaining funds will be
              rebalanced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId != null}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingId != null}
              onClick={() => void confirmDelete()}
            >
              {deletingId ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
