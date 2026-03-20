"use client"

import { useMemo, useState } from "react"
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
  TaxBracketLadder,
  type HouseholdChargeableMarker,
  type ReliefPreviewModel,
} from "@/components/dashboard/tax/tax-bracket-ladder"
import { Calculator, Pencil } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { CurrencyInput } from "@/components/ui/currency-input"

const RELIEF_PREVIEW_TYPES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "srs", label: "SRS contribution" },
  { id: "donations", label: "Donations (IPC)" },
  { id: "course_fees", label: "Course fees" },
  { id: "cpf_topup_self", label: "CPF top-up (self)" },
  { id: "cpf_topup_family", label: "CPF top-up (family)" },
  { id: "parent", label: "Parent relief" },
  { id: "spouse", label: "Spouse relief" },
  { id: "wmcr", label: "WMCR" },
  { id: "other", label: "Other" },
]

type ReliefRow = { on: boolean; amount: number }

function emptyReliefPreviewRows(): Record<string, ReliefRow> {
  return Object.fromEntries(
    RELIEF_PREVIEW_TYPES.map((t) => [t.id, { on: false, amount: 0 }])
  )
}

interface TaxComparisonProps {
  year: number
  calculatedAmount: number
  actualAmount: number | null
  onEnterActual: () => void
  onFromMonthly: () => void
  /** Used to anchor the “current → preview” horizontal connector on household charts */
  profileId?: string
  profileName?: string
  snapshot: TaxSnapshot | null | undefined
  /** When false, marginal position dot is hidden (multi-profile household layout) */
  showMarginalPositionMarker?: boolean
  marginalMarkerSubjectLabel?: string
  householdChargeableMarkers?: HouseholdChargeableMarker[]
}

function BreakdownRow({
  label,
  value,
  sign = "",
  muted,
  infoTooltipId,
}: {
  label: string
  value: string
  sign?: "" | "+" | "−" | "="
  muted?: boolean
  infoTooltipId?: keyof typeof TOOLTIPS
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
}: TaxComparisonProps) {
  const [reliefPreviewRows, setReliefPreviewRows] = useState(emptyReliefPreviewRows)

  const diff =
    actualAmount != null ? actualAmount - calculatedAmount : null

  const hasModel = Boolean(snapshot)
  const rebateNote =
    snapshot && snapshot.rebateAmount <= 0 && year !== 2025
      ? "No government rebate is built into this estimate for this YA yet (IRAS may announce one)."
      : null

  const extraCountedRelief = useMemo(() => {
    let s = 0
    for (const t of RELIEF_PREVIEW_TYPES) {
      const row = reliefPreviewRows[t.id]
      if (!row?.on || row.amount <= 0) continue
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

  function setReliefRow(id: string, patch: Partial<ReliefRow>) {
    setReliefPreviewRows((prev) => {
      const cur = prev[id] ?? { on: false, amount: 0 }
      return { ...prev, [id]: { ...cur, ...patch } }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CardTitle className="text-base leading-snug">
              {profileName ? `${profileName} · ` : ""}YA {year} · Estimated vs IRAS
            </CardTitle>
            <InfoTooltip id="TAX_ESTIMATED_PAYABLE" />
          </div>
          <CardDescription className="text-xs leading-relaxed sm:text-sm">
            <strong>Estimated tax payable</strong> is resident tax on{" "}
            <strong>salary + bonus</strong>, after <strong>reliefs</strong> (capped
            at $80k), using <strong>progressive rates</strong>, then any{" "}
            <strong>YA rebate</strong> we model. It is not a bill from IRAS — compare
            with your actual assessment when you enter it.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onFromMonthly} className="shrink-0">
              <Calculator className="mr-1 size-4" />
              From monthly
            </Button>
            <InfoTooltip id="TAX_FROM_MONTHLY" />
          </span>
          <Button variant="outline" size="sm" onClick={onEnterActual} className="shrink-0">
            <Pencil className="mr-1 size-4" />
            {actualAmount != null ? "Edit actual" : "Enter IRAS actual"}
          </Button>
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
              {actualAmount != null
                ? `$${formatCurrency(actualAmount)}`
                : "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Difference (actual − estimate)
            </p>
            <p
              className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${
                diff != null && diff < 0
                  ? "text-green-600 dark:text-green-400"
                  : diff != null && diff > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
              }`}
            >
              {diff != null
                ? `${diff >= 0 ? "+" : ""}$${formatCurrency(diff)}`
                : "—"}
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

            <div className="rounded-xl border bg-muted/20 px-4 py-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Ways to lower tax — relief preview
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Toggle categories and enter amounts to see how extra reliefs could
                  move chargeable income on the chart. This is a what-if only — it is{" "}
                  <span className="font-medium text-foreground">not saved</span>. Use{" "}
                  <span className="font-medium text-foreground">Manual reliefs</span>{" "}
                  below to persist amounts (subject to IRAS rules).
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground sm:text-sm">
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
                      </strong>
                      .
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

              <div className="space-y-3">
                {RELIEF_PREVIEW_TYPES.map((t) => {
                  const row = reliefPreviewRows[t.id] ?? { on: false, amount: 0 }
                  return (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                    >
                      <Switch
                        id={`relief-preview-${t.id}`}
                        checked={row.on}
                        onCheckedChange={(c) =>
                          setReliefRow(t.id, { on: Boolean(c) })
                        }
                      />
                      <Label
                        htmlFor={`relief-preview-${t.id}`}
                        className="min-w-[10rem] flex-1 text-sm font-normal leading-snug"
                      >
                        {t.label}
                      </Label>
                      <CurrencyInput
                        className="h-9 w-[9rem] shrink-0 md:max-w-[11rem]"
                        value={row.amount}
                        onChange={(v) =>
                          setReliefRow(t.id, { amount: v ?? 0 })
                        }
                        disabled={!row.on}
                      />
                    </div>
                  )
                })}
              </div>

              {extraCountedRelief > 0 && chargeableDelta > 0 && taxPreviewDelta ? (
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
              ) : extraCountedRelief > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Extra reliefs do not change chargeable income further (e.g. already
                  at the $80k cap in this model).
                </p>
              ) : null}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">How this estimate is built</h3>
              <div className="space-y-2 rounded-xl border bg-card px-4 py-3">
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
                  </span>
                  .
                </p>
                {rebateNote && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {rebateNote}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {!hasModel && (
          <p className="text-sm text-muted-foreground">
            Add <strong>annual salary</strong> (and bonus) in income settings for
            this profile to show the bracket ladder and step-by-step breakdown.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
