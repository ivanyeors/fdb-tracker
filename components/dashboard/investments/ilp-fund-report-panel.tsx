"use client"

import { useMemo } from "react"
import { Group } from "@visx/group"
import { GridColumns } from "@visx/grid"
import { ParentSize } from "@visx/responsive"
import { scaleLinear } from "@visx/scale"
import { AxisBottom } from "@visx/axis"
import { AllocationChart } from "@/components/dashboard/investments/allocation-chart"
import { TrailingReturnsChart } from "@/components/dashboard/investments/trailing-returns-chart"
import { StockStyleGrid } from "@/components/dashboard/investments/stock-style-grid"
import {
  annualPerformanceRawRows,
  annualPerformanceToSeries,
  assetAllocationToBarRows,
  assetAllocationToCategoryDonutRows,
  assetAllocationToDonutRows,
  feesToEntries,
  hasAnyCategoryPct,
  parseFundReportSnapshot,
  performanceTableToSeries,
  riskMeasuresToEntries,
  sectorBreakdownToDonutRows,
  snapshotHeaderEntries,
  stockStatsToEntries,
  type AssetAllocationBarRow,
  type KeyValueEntry,
} from "@/lib/investments/ilp-snapshot-ui"

const FUND_BAR = "var(--color-chart-1)"
const CAT_BAR = "var(--color-chart-2)"

/** Tight padding; shared by Fund mix / Category mix panels. */
const ALLOCATION_MIX_CARD =
  "rounded-xl border border-border/80 bg-muted/5 px-2 py-2 sm:px-2.5 sm:py-2"

const ALLOCATION_CHART_PROPS = {
  height: 216,
  legendLayout: "beside" as const,
  legendBesideMinWidth: 260,
  legendMaxItems: 6,
}

function AssetAllocationGroupedBars({
  rows,
}: {
  rows: AssetAllocationBarRow[]
}) {
  const filtered = useMemo(
    () => rows.filter((r) => r.fundPct != null || r.categoryPct != null),
    [rows],
  )
  if (filtered.length === 0) return null

  return (
    <ParentSize debounceTime={10}>
      {({ width }) => {
        const w = Math.max(width, 200)
        const labelCol = Math.min(120, w * 0.32)
        const chartW = w - labelCol - 8
        const rowH = 36
        const barH = 13
        const gap = 3
        const height = filtered.length * rowH + 32
        const margin = { top: 6, right: 12, bottom: 22, left: 0 }

        const maxVal = Math.max(
          5,
          ...filtered.flatMap((r) => [r.fundPct ?? 0, r.categoryPct ?? 0]),
        )
        const xMax =
          Math.min(100, maxVal) < maxVal
            ? maxVal * 1.08
            : Math.max(maxVal * 1.05, 10)

        const xScale = scaleLinear<number>({
          domain: [0, xMax],
          range: [0, chartW - margin.right],
        })

        return (
          <svg width={w} height={height} className="overflow-visible">
            <Group left={labelCol} top={margin.top}>
              <GridColumns
                scale={xScale}
                width={chartW - margin.right}
                height={filtered.length * rowH - 4}
                stroke="var(--border)"
                strokeOpacity={0.35}
                strokeDasharray="3,4"
                numTicks={4}
                pointerEvents="none"
              />
              {filtered.map((r, i) => {
                const yBase = i * rowH
                const fw =
                  r.fundPct != null ? Math.max(0, xScale(r.fundPct) ?? 0) : 0
                const cw =
                  r.categoryPct != null
                    ? Math.max(0, xScale(r.categoryPct) ?? 0)
                    : 0
                return (
                  <Group key={`${r.label}-${i}`}>
                    <text
                      x={-6}
                      y={yBase + barH * 0.72}
                      textAnchor="end"
                      className="fill-foreground text-[11px] leading-tight"
                    >
                      {r.label.length > 18
                        ? `${r.label.slice(0, 16)}…`
                        : r.label}
                      <title>{r.label}</title>
                    </text>
                    <rect
                      x={0}
                      y={yBase}
                      width={fw}
                      height={barH}
                      rx={2}
                      fill={FUND_BAR}
                    />
                    <rect
                      x={0}
                      y={yBase + barH + gap}
                      width={cw}
                      height={barH}
                      rx={2}
                      fill={CAT_BAR}
                    />
                  </Group>
                )
              })}
              <AxisBottom
                top={filtered.length * rowH + 4}
                scale={xScale}
                numTicks={4}
                stroke="var(--border)"
                tickStroke="var(--border)"
                tickLabelProps={() => ({
                  fill: "var(--muted-foreground)",
                  fontSize: 9,
                  textAnchor: "middle",
                })}
              />
            </Group>
            <text
              x={labelCol}
              y={height - 4}
              className="fill-muted-foreground text-[9px]"
            >
              Fund % (top) · Category % (bottom)
            </text>
          </svg>
        )
      }}
    </ParentSize>
  )
}

function AnnualPerformanceBars({
  points,
}: {
  points: { period: string; value: number }[]
}) {
  if (points.length === 0) return null
  return (
    <ParentSize debounceTime={10}>
      {({ width }) => {
        const w = Math.max(width, 200)
        const labelCol = Math.min(100, w * 0.28)
        const chartW = w - labelCol - 8
        const rowH = 28
        const height = points.length * rowH + 36
        const margin = { top: 6, right: 12, bottom: 22, left: 0 }

        const vals = points.map((p) => p.value)
        const minV = Math.min(...vals, 0)
        const maxV = Math.max(...vals, 0)
        const pad = Math.max((maxV - minV) * 0.08, 1)
        const d0 = minV - pad
        const d1 = maxV + pad

        const xScale = scaleLinear<number>({
          domain: [d0, d1],
          range: [0, chartW - margin.right],
        })
        const zero = xScale(0) ?? 0

        return (
          <svg width={w} height={height} className="overflow-visible">
            <Group left={labelCol} top={margin.top}>
              <line
                x1={zero}
                x2={zero}
                y1={0}
                y2={points.length * rowH - 4}
                stroke="var(--border)"
                strokeOpacity={0.6}
              />
              {points.map((p, i) => {
                const yBase = i * rowH
                const xa = xScale(Math.min(0, p.value)) ?? 0
                const xb = xScale(Math.max(0, p.value)) ?? 0
                const left = Math.min(xa, xb)
                const barW = Math.abs(xb - xa)
                return (
                  <Group key={`${p.period}-${i}`}>
                    <text
                      x={-6}
                      y={yBase + rowH * 0.55}
                      textAnchor="end"
                      className="fill-foreground text-[11px]"
                    >
                      {p.period.length > 14
                        ? `${p.period.slice(0, 12)}…`
                        : p.period}
                      <title>{p.period}</title>
                    </text>
                    <rect
                      x={left}
                      y={yBase + 4}
                      width={Math.max(barW, p.value === 0 ? 2 : barW)}
                      height={rowH - 10}
                      rx={2}
                      fill="var(--color-chart-3)"
                    />
                    <text
                      x={(xScale(p.value) ?? 0) + (p.value >= 0 ? 4 : -4)}
                      y={yBase + rowH * 0.58}
                      textAnchor={p.value >= 0 ? "start" : "end"}
                      className="fill-muted-foreground text-[10px] tabular-nums"
                    >
                      {p.value.toFixed(1)}%
                    </text>
                  </Group>
                )
              })}
              <AxisBottom
                top={points.length * rowH + 4}
                scale={xScale}
                numTicks={4}
                stroke="var(--border)"
                tickStroke="var(--border)"
                tickFormat={(v) => `${Number(v).toFixed(0)}%`}
                tickLabelProps={() => ({
                  fill: "var(--muted-foreground)",
                  fontSize: 9,
                  textAnchor: "middle",
                })}
              />
            </Group>
          </svg>
        )
      }}
    </ParentSize>
  )
}

/** Reusable key-value grid for stats, fees, risk measures. */
function KeyValueGrid({
  title,
  entries,
}: {
  title: string
  entries: KeyValueEntry[]
}) {
  if (entries.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map(({ label, value }) => (
          <div
            key={label}
            className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-muted/10 px-3 py-2"
          >
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium tabular-nums text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export type IlpFundReportPanelProps = {
  snapshot: Record<string, unknown> | null | undefined
}

export function IlpFundReportPanel({ snapshot }: IlpFundReportPanelProps) {
  const s = useMemo(() => parseFundReportSnapshot(snapshot ?? null), [snapshot])
  const headerRows = useMemo(
    () => (s?.header ? snapshotHeaderEntries(s.header) : []),
    [s],
  )
  const barRows = useMemo(
    () =>
      s?.assetAllocation ? assetAllocationToBarRows(s.assetAllocation) : [],
    [s],
  )
  const donutRows = useMemo(
    () =>
      s?.assetAllocation ? assetAllocationToDonutRows(s.assetAllocation) : [],
    [s],
  )
  const categoryDonutRows = useMemo(
    () =>
      s?.assetAllocation
        ? assetAllocationToCategoryDonutRows(s.assetAllocation)
        : [],
    [s],
  )
  const showGroupedBars = hasAnyCategoryPct(barRows)
  const annualSeries = useMemo(
    () => (s ? annualPerformanceToSeries(s.annualPerformance) : []),
    [s],
  )
  const annualRaw = useMemo(
    () => (s ? annualPerformanceRawRows(s.annualPerformance) : []),
    [s],
  )

  // Version 2 data
  const sectorDonutRows = useMemo(
    () => sectorBreakdownToDonutRows(s?.sectorBreakdown),
    [s],
  )
  const trailingSeries = useMemo(
    () => performanceTableToSeries(s?.trailingReturns),
    [s],
  )
  const calendarSeries = useMemo(
    () => performanceTableToSeries(s?.calendarYearReturns),
    [s],
  )
  const statsEntries = useMemo(() => stockStatsToEntries(s?.stockStats), [s])
  const feeEntries = useMemo(() => feesToEntries(s?.fees), [s])
  const riskEntries = useMemo(() => riskMeasuresToEntries(s?.riskMeasures), [s])

  if (!s) return null

  const topHoldings = s.topHoldings?.length ? s.topHoldings : []

  const hasContent =
    headerRows.length > 0 ||
    donutRows.length > 0 ||
    categoryDonutRows.length > 0 ||
    barRows.length > 0 ||
    annualSeries.length > 0 ||
    annualRaw.length > 0 ||
    topHoldings.length > 0 ||
    sectorDonutRows.length > 0 ||
    trailingSeries.length > 0 ||
    calendarSeries.length > 0 ||
    statsEntries.length > 0 ||
    feeEntries.length > 0 ||
    riskEntries.length > 0 ||
    s.warnings.length > 0

  if (!hasContent) return null

  return (
    <div className="mt-4 space-y-6 border-t border-border pt-4">
      <div>
        <h4 className="text-sm font-medium text-foreground">
          Imported fund report
        </h4>
        {s.investmentName ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {s.investmentName}
          </p>
        ) : null}
      </div>

      {headerRows.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Key facts
          </p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {headerRows.map(({ key, value }) => (
              <div
                key={key}
                className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-muted/10 px-3 py-2"
              >
                <dt className="text-[11px] text-muted-foreground">{key}</dt>
                <dd className="text-sm leading-snug font-medium text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {/* Stats, fees, risk — compact key-value grids */}
      <KeyValueGrid title="Fund statistics" entries={statsEntries} />
      <KeyValueGrid title="Fees" entries={feeEntries} />
      <KeyValueGrid title="Risk measures" entries={riskEntries} />

      {barRows.length > 0 ||
      donutRows.length > 0 ||
      categoryDonutRows.length > 0 ? (
        <div className="space-y-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Asset allocation
          </p>
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <div className={ALLOCATION_MIX_CARD}>
              <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                Fund mix
              </p>
              {donutRows.length > 0 ? (
                <div className="overflow-visible pt-0.5">
                  <AllocationChart
                    data={donutRows}
                    {...ALLOCATION_CHART_PROPS}
                  />
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No fund weights in snapshot.
                </p>
              )}
            </div>
            <div className={ALLOCATION_MIX_CARD}>
              <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                Category mix
              </p>
              <p className="mb-1 text-[10px] leading-snug text-muted-foreground/90">
                Morningstar category benchmark (replaces regional map in source
                report).
              </p>
              {categoryDonutRows.length > 0 ? (
                <div className="overflow-visible pt-0.5">
                  <AllocationChart
                    data={categoryDonutRows}
                    {...ALLOCATION_CHART_PROPS}
                  />
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No category breakdown in snapshot.
                </p>
              )}
            </div>
          </div>
          {showGroupedBars ? (
            <div>
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                Fund vs category
              </p>
              <AssetAllocationGroupedBars rows={barRows} />
              <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-sm"
                    style={{ background: FUND_BAR }}
                  />
                  Fund
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-sm"
                    style={{ background: CAT_BAR }}
                  />
                  Category
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Sector breakdown donut */}
      {sectorDonutRows.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Sector breakdown
          </p>
          <div className={ALLOCATION_MIX_CARD}>
            <div className="overflow-visible pt-0.5">
              <AllocationChart
                data={sectorDonutRows}
                {...ALLOCATION_CHART_PROPS}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Stock style box */}
      {s.stockStyle ? (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Investment style
          </p>
          <StockStyleGrid style={s.stockStyle} />
        </div>
      ) : null}

      {topHoldings.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Portfolio holdings
          </p>
          <p className="mb-2 text-[10px] leading-snug text-muted-foreground/90">
            From the report table (variable number of positions; weight is % of
            fund assets).
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">
                    #
                  </th>
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">
                    Security
                  </th>
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">
                    Sector
                  </th>
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">
                    Country
                  </th>
                  <th className="px-2 py-2 text-right text-[11px] font-medium text-muted-foreground">
                    % assets
                  </th>
                </tr>
              </thead>
              <tbody>
                {topHoldings.map((row, i) => (
                  <tr
                    key={`${row.securityName}-${i}`}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                      {row.rank ?? "—"}
                    </td>
                    <td className="max-w-[200px] px-2 py-1.5 font-medium text-foreground">
                      <span className="line-clamp-2">{row.securityName}</span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {row.sector ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {row.country ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                      {row.weightPct != null
                        ? row.weightPct.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {s.annualPerformance?.periodLabels?.length ? (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Annual performance
          </p>
          {annualSeries.length > 0 ? (
            <AnnualPerformanceBars points={annualSeries} />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Period
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                      Fund
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {annualRaw.map((row) => (
                    <tr
                      key={row.period}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-foreground">
                        {row.period}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Trailing returns */}
      {trailingSeries.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Trailing returns
          </p>
          <TrailingReturnsChart data={trailingSeries} />
        </div>
      ) : null}

      {/* Calendar year returns */}
      {calendarSeries.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Calendar year returns
          </p>
          <TrailingReturnsChart data={calendarSeries} />
        </div>
      ) : null}

      {s.growthChartPresent && (
        <p className="text-[11px] text-muted-foreground">
          Growth chart present in source report; interactive chart data is not
          stored in this snapshot.
        </p>
      )}

      {s.warnings.length > 0 ? (
        <ul className="list-inside list-disc text-[11px] text-amber-700 dark:text-amber-400">
          {s.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Alias for apps that prefer a "visualization" name (same as `IlpFundReportPanel`). */
export const IlpFundReportVisualization = IlpFundReportPanel
