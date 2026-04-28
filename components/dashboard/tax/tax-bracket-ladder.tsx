"use client"

import type { ProgressiveBracketBand } from "@/lib/calculations/tax"
import {
  chargeableIncomeInLayer,
  getResidentBracketChartLayers,
  resolveTaxBracketChartAxisMaxDollars,
} from "@/lib/calculations/tax"
import { formatCurrency } from "@/lib/utils"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Singapore resident schedule tops out at 24% — normalize for linear scale */
const MAX_RESIDENT_MARGIN_RATE = 0.24

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Linear perceptual scale: low marginal rates → cool teal, high → warm red.
 * Used for solid band fill; tail uses the same colour at {@link BRACKET_TAIL_ALPHA}.
 */
export function bracketBandColorForRate(rate: number): string {
  const t = Math.min(1, Math.max(0, rate / MAX_RESIDENT_MARGIN_RATE))
  const h = lerp(201, 14, t)
  const s = lerp(36, 72, t)
  const l = lerp(50, 41, t)
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
}

/** Opacity for the “rest of bracket width” strip (same hue as solid). */
const BRACKET_TAIL_ALPHA = 0.26

function roundCent(n: number): number {
  return Math.round(n * 100) / 100
}

export type HouseholdChargeableMarker = {
  id: string
  label: string
  chargeableIncome: number
}

/** Hypothetical position after extra reliefs (same scale as `chargeableIncome`). */
export type ReliefPreviewModel = {
  chargeableIncome: number
  marginalBandFrom: number
  marginalRate: number
  marginalBandTo: number | null
}

interface TaxBracketLadderProps {
  readonly chargeableIncome: number
  /** Retained for API compatibility; widths use full IRAS ladder on a dollar axis */
  readonly bracketAllocation: ProgressiveBracketBand[]
  readonly marginalRate: number
  readonly marginalBandFrom: number
  readonly marginalBandTo: number | null
  readonly showMarginalPositionMarker?: boolean
  readonly marginalMarkerSubjectLabel?: string
  readonly householdChargeableMarkers?: HouseholdChargeableMarker[]
  /** This profile’s id — for horizontal connector from household chargeable dot when marginal dot is hidden */
  readonly reliefPreviewSubjectMarkerId?: string
  readonly reliefPreview?: ReliefPreviewModel | null
  readonly barScaleProfileLabel?: string
  readonly className?: string
}

export function TaxBracketLadder({
  chargeableIncome,
  marginalRate,
  marginalBandFrom,
  marginalBandTo,
  showMarginalPositionMarker = true,
  marginalMarkerSubjectLabel = "This profile",
  householdChargeableMarkers,
  reliefPreviewSubjectMarkerId,
  reliefPreview,
  barScaleProfileLabel,
  className,
}: TaxBracketLadderProps) {
  const ci = Math.max(0, chargeableIncome)
  const pCi =
    reliefPreview != null ? Math.max(0, reliefPreview.chargeableIncome) : -1
  const showReliefPreview =
    reliefPreview != null && pCi >= 0 && roundCent(pCi) !== roundCent(ci)

  const previewMarginalFrom = reliefPreview?.marginalBandFrom ?? 0

  const showHouseholdDots =
    householdChargeableMarkers != null &&
    householdChargeableMarkers.length > 1

  const otherAmounts =
    showHouseholdDots && householdChargeableMarkers
      ? householdChargeableMarkers.map((m) => m.chargeableIncome)
      : []

  const axisMax = resolveTaxBracketChartAxisMaxDollars({
    chargeableIncome: ci,
    otherChargeableIncomes: otherAmounts,
  })

  const layers = getResidentBracketChartLayers(axisMax)

  if (layers.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        No bracket scale to display.
      </div>
    )
  }

  const bracketRatesSorted = [...new Set(layers.map((l) => l.rate))].sort(
    (a, b) => a - b
  )

  const labelHigh =
    Number.isFinite(marginalBandTo) && marginalBandTo != null
      ? `–$${formatCurrency(marginalBandTo)}`
      : "and above"

  const barOwner =
    barScaleProfileLabel ?? marginalMarkerSubjectLabel ?? "This profile"

  const householdDotStagger = new Map<number, number>()
  const householdPositions =
    showHouseholdDots && axisMax > 0
      ? householdChargeableMarkers.map((m) => {
          const ciMember = Math.max(0, m.chargeableIncome)
          const posPct = Math.min(
            100,
            Math.max(0, (ciMember / axisMax) * 100)
          )
          const rounded = Math.round(posPct * 10) / 10
          const n = householdDotStagger.get(rounded) ?? 0
          householdDotStagger.set(rounded, n + 1)
          return { ...m, posPct, stagger: n }
        })
      : []

  const marginalStartPct =
    ci > 0 ? Math.min(100, (marginalBandFrom / axisMax) * 100) : 0

  const previewChargeablePct =
    showReliefPreview && axisMax > 0
      ? Math.min(100, Math.max(0, (pCi / axisMax) * 100))
      : 0

  const previewMarginalStartPct =
    showReliefPreview && pCi > 0 && axisMax > 0
      ? Math.min(100, Math.max(0, (previewMarginalFrom / axisMax) * 100))
      : 0

  const showSeparatePreviewMarginalLine =
    showReliefPreview &&
    pCi > 0 &&
    Math.abs(previewMarginalStartPct - previewChargeablePct) > 0.06

  const subjectHousehold =
    reliefPreviewSubjectMarkerId != null &&
    reliefPreviewSubjectMarkerId !== ""
      ? householdPositions.find((h) => h.id === reliefPreviewSubjectMarkerId)
      : undefined

  let connectorStartPct: number | null = null
  let connectorTopStyle = "50%"

  if (showMarginalPositionMarker && ci > 0) {
    connectorStartPct = marginalStartPct
  } else if (subjectHousehold) {
    connectorStartPct = subjectHousehold.posPct
    connectorTopStyle = `calc(50% - ${subjectHousehold.stagger * 5}px)`
  }

  let connectorLeftPct = 0
  let connectorWidthPct = 0
  if (
    showReliefPreview &&
    pCi > 0 &&
    connectorStartPct != null &&
    Math.abs(connectorStartPct - previewChargeablePct) > 0.02
  ) {
    connectorLeftPct = Math.min(connectorStartPct, previewChargeablePct)
    connectorWidthPct = Math.abs(previewChargeablePct - connectorStartPct)
  }
  const showCurrentToPreviewConnector = connectorWidthPct > 0

  const previewLineClass =
    "pointer-events-auto absolute inset-y-0 z-[8] w-[3px] min-w-[3px] -translate-x-1/2 cursor-default rounded-[1px] border-0 p-0 shadow-sm ring-1 ring-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  const dotClassName =
    "size-2.5 rounded-full border-0 bg-white shadow-sm ring-1 ring-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-foreground">
          Chargeable income in tax brackets
        </p>
        <InfoTooltip id="TAX_PROGRESSIVE_BRACKETS" />
      </div>
      <div className="relative h-10 w-full rounded-lg ring-1 ring-border">
        <div className="flex h-full w-full overflow-hidden rounded-[inherit]">
          {layers.map((layer) => {
            const bandPct = (layer.widthDollars / axisMax) * 100
            const used = chargeableIncomeInLayer(ci, layer.bandFrom, layer.bandTo)
            const fillPct =
              layer.widthDollars > 0
                ? Math.min(100, (used / layer.widthDollars) * 100)
                : 0
            const fill = bracketBandColorForRate(layer.rate)
            const bandLabelHigh = Number.isFinite(layer.bandTo)
              ? `–$${formatCurrency(layer.bandTo)}`
              : "and above"
            const taxInBand =
              used > 0 ? Math.round(used * layer.rate * 100) / 100 : 0
            const previewUsed = showReliefPreview
              ? chargeableIncomeInLayer(pCi, layer.bandFrom, layer.bandTo)
              : 0
            const previewTaxInBand =
              previewUsed > 0
                ? Math.round(previewUsed * layer.rate * 100) / 100
                : 0
            return (
              <Tooltip key={`bracket-${layer.bandFrom}-${layer.rate}`}>
                <TooltipTrigger asChild>
                  <div
                    className="relative h-full min-w-px cursor-default overflow-hidden transition-opacity hover:opacity-95"
                    style={{ width: `${bandPct}%` }}
                  >
                    <div className="flex h-full w-full">
                      <div
                        className="h-full shrink-0 transition-opacity hover:opacity-95"
                        style={{
                          width: `${fillPct}%`,
                          backgroundColor: fill,
                        }}
                      />
                      <div
                        className="h-full min-w-0 flex-1 transition-opacity hover:opacity-95"
                        style={{
                          backgroundColor: fill,
                          opacity: BRACKET_TAIL_ALPHA,
                        }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  <p className="font-medium">
                    From ${formatCurrency(layer.bandFrom)} {bandLabelHigh} at{" "}
                    {(layer.rate * 100).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Band width on chart: ${formatCurrency(layer.widthDollars)}.
                    {barOwner}: ${formatCurrency(used)} in this band
                    {used > 0
                      ? ` · tax ${formatCurrency(taxInBand)}`
                      : ""}
                    .
                  </p>
                  {showReliefPreview && previewUsed > 0 ? (
                    <p className="mt-1 text-muted-foreground border-t border-border pt-1">
                      Preview: ${formatCurrency(previewUsed)} in this band
                      {previewTaxInBand > 0
                        ? ` · tax ${formatCurrency(previewTaxInBand)}`
                        : ""}
                      .
                    </p>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        {showMarginalPositionMarker && ci > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 ${dotClassName}`}
                style={{ left: `${marginalStartPct}%` }}
                aria-label={`${marginalMarkerSubjectLabel}: start of marginal tax bracket on this bar`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p className="font-medium">{marginalMarkerSubjectLabel}</p>
              <p className="mt-1 text-muted-foreground">
                Top marginal slice starts at ${formatCurrency(marginalBandFrom)}{" "}
                {labelHigh} at{" "}
                {(marginalRate * 100).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                % —{" "}
                {marginalStartPct.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}
                % from the left on the $0–${formatCurrency(axisMax)} scale.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {showCurrentToPreviewConnector ? (
          <div
            className="pointer-events-none absolute z-[9] h-0 -translate-y-1/2 border-t border-dotted border-foreground/55"
            style={{
              left: `${connectorLeftPct}%`,
              width: `${connectorWidthPct}%`,
              top: connectorTopStyle,
            }}
            aria-hidden
          />
        ) : null}
        {showReliefPreview && pCi > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`${previewLineClass} bg-white/85 dark:bg-white/75`}
                style={{ left: `${previewChargeablePct}%` }}
                aria-label="Preview chargeable income on this scale"
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p className="font-medium">Preview chargeable</p>
              <p className="mt-1 text-muted-foreground">
                ${formatCurrency(pCi)} —{" "}
                {previewChargeablePct.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}
                % from the left on the $0–${formatCurrency(axisMax)} scale (if
                extra reliefs applied as modelled).
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {showSeparatePreviewMarginalLine ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`${previewLineClass} bg-primary/75 dark:bg-primary/65`}
                style={{ left: `${previewMarginalStartPct}%` }}
                aria-label="Preview marginal band start on this scale"
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p className="font-medium">Preview · start of marginal band</p>
              <p className="mt-1 text-muted-foreground">
                Top preview slice starts at $
                {formatCurrency(previewMarginalFrom)} on the $0–$
                {formatCurrency(axisMax)} scale.
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {householdPositions.map(({ id, label, chargeableIncome: memberCi, posPct, stagger }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 ${dotClassName}`}
                style={{
                  left: `${posPct}%`,
                  top: `calc(50% - ${stagger * 5}px)`,
                }}
                aria-label={`${label}: chargeable income on full bracket scale`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p className="font-medium">{label}</p>
              <p className="mt-1 text-muted-foreground">
                Chargeable income ${formatCurrency(memberCi)} —{" "}
                {posPct.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}
                % from the left on the $0–${formatCurrency(axisMax)} resident
                scale (same bands as this chart).
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {bracketRatesSorted.map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-sm ring-1 ring-black/10 dark:ring-white/15"
              style={{ backgroundColor: bracketBandColorForRate(r) }}
              aria-hidden
            />
            {(r * 100).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            %
          </span>
        ))}
      </div>
    </div>
  )
}
