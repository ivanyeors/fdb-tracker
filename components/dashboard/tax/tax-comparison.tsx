"use client"

import { useMemo, useState, type ReactNode } from "react"
import { formatCurrency } from "@/lib/utils"
import type { TaxSnapshot } from "@/lib/tax/tax-snapshot"
import {
  countedManualReliefForType,
  getMarginalBracketInfo,
  previewChargeableAfterExtraCountedRelief,
  taxDeltaFromLowerChargeableIncome,
} from "@/lib/calculations/tax"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import type { TOOLTIPS } from "@/lib/tooltips"
import { Separator } from "@/components/ui/separator"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ui/responsive-dialog"
import {
  TaxBracketLadder,
  type HouseholdChargeableMarker,
  type ReliefPreviewModel,
} from "@/components/dashboard/tax/tax-bracket-ladder"
import { Calculator, CircleHelp, Pencil } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { CurrencyInput } from "@/components/ui/currency-input"

type ReliefPreviewType = {
  id: string
  label: string
  max: number
  step: number
  note?: string
}

const RELIEF_PREVIEW_TYPES: ReadonlyArray<ReliefPreviewType> = [
  { id: "srs", label: "SRS contribution", max: 15_300, step: 100 },
  { id: "donations", label: "Donations (IPC)", max: 50_000, step: 500, note: "250% deduction applied" },
  { id: "course_fees", label: "Course fees", max: 5_500, step: 100 },
  { id: "cpf_topup_self", label: "CPF top-up (self)", max: 8_000, step: 100 },
  { id: "cpf_topup_family", label: "CPF top-up (family)", max: 8_000, step: 100 },
  { id: "parent", label: "Parent relief", max: 18_000, step: 500 },
  { id: "spouse", label: "Spouse relief", max: 2_000, step: 100 },
  { id: "wmcr", label: "WMCR", max: 50_000, step: 500 },
  { id: "other", label: "Other", max: 20_000, step: 500 },
]

type ReliefRow = { amount: number }

function diffColor(diff: number | null | undefined): string {
  if (diff == null) return "text-muted-foreground"
  if (diff < 0) return "text-green-600 dark:text-green-400"
  if (diff > 0) return "text-red-600 dark:text-red-400"
  return "text-muted-foreground"
}

function emptyReliefPreviewRows(): Record<string, ReliefRow> {
  return Object.fromEntries(
    RELIEF_PREVIEW_TYPES.map((t) => [t.id, { amount: 0 }])
  )
}

interface TaxComparisonProps {
  readonly year: number
  readonly calculatedAmount: number
  readonly actualAmount: number | null
  readonly onEnterActual: () => void
  readonly onFromMonthly: () => void
  /** Used to anchor the “current → preview” horizontal connector on household charts */
  readonly profileId?: string
  readonly profileName?: string
  readonly snapshot: TaxSnapshot | null | undefined
  /** When false, marginal position dot is hidden (multi-profile household layout) */
  readonly showMarginalPositionMarker?: boolean
  readonly marginalMarkerSubjectLabel?: string
  readonly householdChargeableMarkers?: HouseholdChargeableMarker[]
  /** Rendered at the bottom of the card (e.g. manual reliefs). */
  readonly cardFooter?: ReactNode
}

function BreakdownRow({
  label,
  value,
  sign = "",
  muted,
  infoTooltipId,
}: {
  readonly label: string
  readonly value: string
  readonly sign?: "" | "+" | "−" | "="
  readonly muted?: boolean
  readonly infoTooltipId?: keyof typeof TOOLTIPS
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 text-sm ${
        muted ? "text-muted-foreground" : ""
      }`}
    >
      <span
        className={`inline-flex items-center gap-1 ${
          sign === "=" ? "font-medium text-foreground" : ""
        }`}
      >
        {sign ? `${sign} ` : ""}
        {label}
        {infoTooltipId && <InfoTooltip id={infoTooltipId} />}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export function TaxComparison({
  year,
  calculatedAmount,
  actualAmount,
  onEnterActual,
  onFromMonthly,
  profileId = "",
  profileName,
  snapshot,
  showMarginalPositionMarker = true,
  marginalMarkerSubjectLabel = "This profile",
  householdChargeableMarkers,
  cardFooter,
}: TaxComparisonProps) {
  const [reliefPreviewRows, setReliefPreviewRows] = useState(emptyReliefPreviewRows)
  const [estimateBreakdownOpen, setEstimateBreakdownOpen] = useState(false)

  const diff =
    actualAmount == null ? null : actualAmount - calculatedAmount

  const hasModel = Boolean(snapshot)
  const rebateNote =
    snapshot && snapshot.rebateAmount <= 0 && year !== 2025
      ? "No government rebate is built into this estimate for this YA yet (IRAS may announce one)."
      : null

  const extraCountedRelief = useMemo(() => {
    let s = 0
    for (const t of RELIEF_PREVIEW_TYPES) {
      const row = reliefPreviewRows[t.id]
      if (!row || row.amount <= 0) continue
      s += countedManualReliefForType(t.id, row.amount)
    }
    return Math.round(s * 100) / 100
  }, [reliefPreviewRows])

  const previewChargeable = useMemo(() => {
    if (!snapshot) return null
    return previewChargeableAfterExtraCountedRelief({
      employmentIncome: snapshot.employmentIncome,
      reliefsRawTotal: snapshot.reliefsRawTotal,
      extraCountedRelief: extraCountedRelief,
    })
  }, [snapshot, extraCountedRelief])

  const reliefPreviewForLadder: ReliefPreviewModel | null = useMemo(() => {
    if (
      !snapshot ||
      previewChargeable == null ||
      extraCountedRelief <= 0
    ) {
      return null
    }
    if (
      Math.round(previewChargeable * 100) / 100 >=
      Math.round(snapshot.chargeableIncome * 100) / 100
    ) {
      return null
    }
    const m = getMarginalBracketInfo(previewChargeable)
    return {
      chargeableIncome: previewChargeable,
      marginalBandFrom: m.marginalBandFrom,
      marginalRate: m.marginalRate,
      marginalBandTo: m.marginalBandTo,
    }
  }, [snapshot, previewChargeable, extraCountedRelief])

  const taxPreviewDelta =
    snapshot && previewChargeable != null && extraCountedRelief > 0
      ? taxDeltaFromLowerChargeableIncome({
          chargeableBefore: snapshot.chargeableIncome,
          chargeableAfter: previewChargeable,
          year,
        })
      : null

  const chargeableDelta =
    snapshot && previewChargeable != null
      ? Math.max(0, snapshot.chargeableIncome - previewChargeable)
      : 0

  function setReliefRow(id: string, amount: number) {
    setReliefPreviewRows((prev) => ({
      ...prev,
      [id]: { amount: Math.max(0, amount) },
    }))
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <CardTitle className="text-base leading-snug">
              {profileName ? `${profileName} · ` : ""}YA {year} · Estimated vs IRAS
            </CardTitle>
            <InfoTooltip id="TAX_ESTIMATED_PAYABLE" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onEnterActual}
            className="shrink-0"
          >
            <Pencil className="mr-1 size-4" />
            {actualAmount == null ? "Enter IRAS actual" : "Edit actual"}
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          <CardDescription className="min-w-0 text-xs leading-relaxed sm:text-sm">
            <strong>Estimated tax payable</strong> is resident tax on{" "}
            <strong>salary + bonus</strong>, after <strong>reliefs</strong> (capped
            at $80k), using <strong>progressive rates</strong>, then any{" "}
            <strong>YA rebate</strong> we model. It is not a bill from IRAS — compare
            with your actual assessment when you enter it.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onFromMonthly}
              className="shrink-0"
            >
              <Calculator className="mr-1 size-4" />
              From monthly
            </Button>
            <InfoTooltip id="TAX_FROM_MONTHLY" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Estimated tax payable
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
              ${formatCurrency(calculatedAmount)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Actual (IRAS)
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
              {actualAmount == null
                ? "—"
                : `$${formatCurrency(actualAmount)}`}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Difference (actual − estimate)
            </p>
            <p
              className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${diffColor(diff)}`}
            >
              {(() => {
                if (diff == null) return "—"
                const sign = diff >= 0 ? "+" : ""
                return `${sign}$${formatCurrency(diff)}`
              })()}
            </p>
          </div>
        </div>

        {hasModel && snapshot && (
          <>
            <TaxBracketLadder
              chargeableIncome={snapshot.chargeableIncome}
              bracketAllocation={snapshot.bracketAllocation}
              marginalRate={snapshot.marginalRate}
              marginalBandFrom={snapshot.marginalBandFrom}
              marginalBandTo={snapshot.marginalBandTo}
              showMarginalPositionMarker={showMarginalPositionMarker}
              marginalMarkerSubjectLabel={marginalMarkerSubjectLabel}
              householdChargeableMarkers={householdChargeableMarkers}
              reliefPreviewSubjectMarkerId={profileId}
              reliefPreview={reliefPreviewForLadder}
              barScaleProfileLabel={marginalMarkerSubjectLabel}
            />

            <div className="space-y-3 rounded-xl border bg-muted/20 px-3 py-3 sm:px-4 sm:py-3">
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-foreground">
                    Ways to lower tax — relief preview
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="How this estimate is built"
                    onClick={() => setEstimateBreakdownOpen(true)}
                  >
                    <CircleHelp className="size-4" />
                  </Button>
                </div>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 pl-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                  {snapshot.reliefCapHeadroom > 0 && (
                    <li>
                      About{" "}
                      <strong className="text-foreground">
                        ${formatCurrency(snapshot.reliefCapHeadroom)}
                      </strong>{" "}
                      of headroom remains under the $80k relief cap before new dollars
                      stop reducing chargeable income in this model.
                    </li>
                  )}
                  {snapshot.reliefCapHeadroom <= 0 && snapshot.marginalRate > 0 && (
                    <li>
                      You are at the{" "}
                      <strong className="text-foreground">$80k</strong> relief cap in
                      this model — further relief cannot reduce chargeable income; top
                      dollars are taxed at{" "}
                      <strong className="text-foreground">
                        {(snapshot.marginalRate * 100).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                        %
                      </strong>{"."}
                    </li>
                  )}
                  {snapshot.marginalRate > 0 && (
                    <li>
                      Extra taxable dollars use your{" "}
                      <strong className="text-foreground">marginal</strong> rate until
                      you cross the next bracket threshold.
                    </li>
                  )}
                </ul>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {RELIEF_PREVIEW_TYPES.map((t) => {
                  const row = reliefPreviewRows[t.id] ?? { amount: 0 }
                  return (
                    <div
                      key={t.id}
                      className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-2 shadow-sm ring-1 ring-foreground/[0.06]"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <Label
                          htmlFor={`relief-input-${t.id}`}
                          className="text-xs font-medium leading-tight text-foreground sm:text-[13px]"
                        >
                          {t.label}
                        </Label>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          max ${formatCurrency(t.max)}
                        </span>
                      </div>
                      <Slider
                        value={[row.amount]}
                        onValueChange={([v]) => setReliefRow(t.id, v)}
                        min={0}
                        max={t.max}
                        step={t.step}
                        className="w-full"
                        aria-label={`${t.label} amount`}
                      />
                      <CurrencyInput
                        id={`relief-input-${t.id}`}
                        className="h-7 text-xs"
                        value={row.amount}
                        onChange={(v) =>
                          setReliefRow(t.id, Math.min(v ?? 0, t.max))
                        }
                      />
                      {t.note && row.amount > 0 && (
                        <p className="text-[10px] leading-tight text-muted-foreground">
                          {t.note} = ${formatCurrency(row.amount * 2.5)} relief
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {(() => {
                if (extraCountedRelief > 0 && chargeableDelta > 0 && taxPreviewDelta) {
                  return (
                <div className="rounded-lg border border-dashed bg-background/60 px-3 py-2 text-xs sm:text-sm">
                  <p className="font-medium text-foreground">Preview impact (model)</p>
                  <p className="mt-1 text-muted-foreground">
                    Chargeable income down by{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      ${formatCurrency(chargeableDelta)}
                    </span>
                    . Tax before rebate down by{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      ${formatCurrency(taxPreviewDelta.taxBeforeRebateDelta)}
                    </span>
                    ; estimated tax payable down by{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      ${formatCurrency(taxPreviewDelta.taxPayableDelta)}
                    </span>{" "}
                    (YA {year} rebate rules applied).
                  </p>
                </div>
                  )
                }
                if (extraCountedRelief > 0) {
                  return (
                <p className="text-xs text-muted-foreground">
                  Extra reliefs do not change chargeable income further (e.g. already
                  at the $80k cap in this model).
                </p>
                  )
                }
                return null
              })()}
            </div>

            <Dialog
              open={estimateBreakdownOpen}
              onOpenChange={setEstimateBreakdownOpen}
            >
              <DialogContent className="max-h-[min(85vh,640px)] gap-4 overflow-y-auto sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>How this estimate is built</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 rounded-xl border bg-muted/20 px-4 py-3">
                  <BreakdownRow
                    label="Employment income (salary + bonus)"
                    value={`$${formatCurrency(snapshot.employmentIncome)}`}
                  />
                  <BreakdownRow
                    sign="−"
                    label={`Reliefs counted (cap $80k; raw total $${formatCurrency(snapshot.reliefsRawTotal)})`}
                    value={`$${formatCurrency(snapshot.totalReliefs)}`}
                    muted
                  />
                  <Separator className="my-2" />
                  <BreakdownRow
                    sign="="
                    label="Chargeable income"
                    value={`$${formatCurrency(snapshot.chargeableIncome)}`}
                  />
                  <BreakdownRow
                    label="Tax before rebate (progressive)"
                    value={`$${formatCurrency(snapshot.taxBeforeRebate)}`}
                    muted
                  />
                  <BreakdownRow
                    sign="−"
                    label="Tax rebate (modelled for this YA)"
                    value={`$${formatCurrency(snapshot.rebateAmount)}`}
                    muted
                    infoTooltipId="TAX_REBATE_YA"
                  />
                  <Separator className="my-2" />
                  <BreakdownRow
                    sign="="
                    label="Estimated tax payable"
                    value={`$${formatCurrency(snapshot.taxPayable)}`}
                  />
                  <p className="pt-2 text-xs text-muted-foreground">
                    Effective rate vs employment income:{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {snapshot.employmentIncome > 0
                        ? `${snapshot.effectiveRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
                        : "—"}
                    </span>{"."}
                  </p>
                  {rebateNote && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {rebateNote}
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {!hasModel && (
          <p className="text-sm text-muted-foreground">
            Add <strong>annual salary</strong> (and bonus) in income settings for
            this profile to show the bracket ladder and step-by-step breakdown.
          </p>
        )}

        {cardFooter}
      </CardContent>
    </Card>
  )
}
