"use client"

import type { StockStyleBox } from "@/lib/ilp-import/types"
import { STYLE_BOX_LABELS } from "@/lib/investments/ilp-snapshot-ui"

const SIZE_LABELS = ["Large", "Mid", "Small"] as const
const STYLE_LABELS = ["Value", "Blend", "Growth"] as const

export function StockStyleGrid({ style }: { readonly style: StockStyleBox }) {
  const maxVal = Math.max(
    ...style.grid.map((v) => v ?? 0),
    1,
  )

  return (
    <div className="inline-block">
      {style.styleLabel && (
        <p className="mb-2 text-xs font-medium text-foreground">
          {style.styleLabel}
        </p>
      )}
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="w-12" />
            {STYLE_LABELS.map((label) => (
              <th
                key={label}
                className="w-16 pb-1 text-center text-[10px] font-medium text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SIZE_LABELS.map((sizeLabel, row) => (
            <tr key={sizeLabel}>
              <td className="pr-2 text-right text-[10px] font-medium text-muted-foreground">
                {sizeLabel}
              </td>
              {STYLE_LABELS.map((_, col) => {
                const idx = row * 3 + col
                const val = style.grid[idx]
                const opacity =
                  val != null && val > 0
                    ? Math.max(0.15, Math.min(1, val / maxVal))
                    : 0
                return (
                  <td key={STYLE_BOX_LABELS[idx]} className="p-0.5">
                    <div
                      className="flex size-14 items-center justify-center rounded border border-border/60 text-xs tabular-nums"
                      style={{
                        backgroundColor:
                          opacity > 0
                            ? `color-mix(in srgb, var(--color-chart-1) ${Math.round(opacity * 100)}%, transparent)`
                            : undefined,
                      }}
                      title={STYLE_BOX_LABELS[idx]}
                    >
                      {val != null ? `${val.toFixed(1)}%` : "—"}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
