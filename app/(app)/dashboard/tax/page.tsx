"use client"

import { useState, useEffect, useMemo } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TaxEntry {
  id: string
  profile_id: string
  year: number
  calculated_amount: number
  actual_amount: number | null
  created_at: string
}

interface TaxRelief {
  id: string
  profile_id: string
  year: number
  relief_type: string
  amount: number
  created_at: string
}

interface TaxData {
  entries: TaxEntry[]
  reliefs: TaxRelief[]
}

export default function TaxPage() {
  const { activeProfileId } = useActiveProfile()
  const [data, setData] = useState<TaxData>({ entries: [], reliefs: [] })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchTax() {
      if (!activeProfileId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const url = new URL("/api/tax", window.location.origin)
        url.searchParams.set("profileId", activeProfileId)

        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch tax:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchTax()
  }, [activeProfileId])

  const latestEntry = data.entries[0] ?? null
  const totalReliefs = useMemo(() => {
    if (!latestEntry) return 0
    return data.reliefs
      .filter(r => r.year === latestEntry.year)
      .reduce((sum, r) => sum + r.amount, 0)
  }, [data.reliefs, latestEntry])

  const latestYearReliefs = useMemo(() => {
    if (!latestEntry) return []
    return data.reliefs.filter(r => r.year === latestEntry.year)
  }, [data.reliefs, latestEntry])

  const hasData = data.entries.length > 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Tax"
        description="Auto-calculated tax, reliefs, and yearly breakdown."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading tax data...
        </div>
      ) : !hasData ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No tax data found for this profile.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label={`YA ${latestEntry!.year} Calculated Tax`}
              value={latestEntry!.calculated_amount.toLocaleString()}
              prefix="$"
            />
            <MetricCard
              label="Actual Paid"
              value={
                latestEntry!.actual_amount != null
                  ? latestEntry!.actual_amount.toLocaleString()
                  : "—"
              }
              prefix={latestEntry!.actual_amount != null ? "$" : ""}
            />
            <MetricCard
              label="Total Reliefs"
              value={totalReliefs.toLocaleString()}
              prefix="$"
            />
          </div>

          {/* Reliefs breakdown for latest year */}
          {latestYearReliefs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Tax Reliefs — YA {latestEntry!.year}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {latestYearReliefs.map((relief) => (
                    <div
                      key={relief.id}
                      className="flex items-center justify-between rounded-lg border px-4 py-2"
                    >
                      <span className="text-sm capitalize">
                        {relief.relief_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        ${relief.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historical tax entries */}
          {data.entries.length > 1 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Year</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Calculated
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Actual Paid
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Difference
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => {
                      const diff =
                        entry.actual_amount != null
                          ? entry.actual_amount - entry.calculated_amount
                          : null
                      return (
                        <tr
                          key={entry.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">
                            YA {entry.year}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            ${entry.calculated_amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {entry.actual_amount != null
                              ? `$${entry.actual_amount.toLocaleString()}`
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              diff != null && diff < 0
                                ? "text-green-600 dark:text-green-400"
                                : diff != null && diff > 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {diff != null
                              ? `${diff >= 0 ? "+" : "-"}$${Math.abs(diff).toLocaleString()}`
                              : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
