"use client"

import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import type {
  CoverageGapItem,
  ProfileCoverageAnalysis,
} from "@/lib/calculations/insurance"
import { getCoverageRecommendation } from "@/lib/calculations/insurance"

type CoverageTableProps = {
  readonly profiles: readonly ProfileCoverageAnalysis[]
  readonly policies: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly type: string
    readonly coverage_type: string | null
    readonly coverage_amount: number | null
    readonly is_active: boolean
    readonly profile_id: string
    readonly coverages: ReadonlyArray<{
      readonly coverage_type: string | null
      readonly coverage_amount: number
    }>
  }>
}

function StatusBadge({ item }: { readonly item: CoverageGapItem }) {
  if (item.coverageType === "hospitalization") {
    return item.hasCoverage ? (
      <Badge className="bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400">
        Covered
      </Badge>
    ) : (
      <Badge variant="destructive">None</Badge>
    )
  }

  if (item.coverageType === "personal_accident") {
    return item.hasCoverage ? (
      <Badge className="bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400">
        Has Coverage
      </Badge>
    ) : (
      <Badge variant="secondary">Optional</Badge>
    )
  }

  if (item.gapPct === 0) {
    return (
      <Badge className="bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400">
        Adequate
      </Badge>
    )
  }
  if (item.gapPct < 50) {
    return (
      <Badge className="bg-yellow-600/20 text-yellow-700 hover:bg-yellow-600/30 dark:text-yellow-400">
        Partial
      </Badge>
    )
  }
  return <Badge variant="destructive">Gap</Badge>
}

function formatHeld(item: CoverageGapItem): string {
  if (item.coverageType === "hospitalization") {
    return item.hasCoverage ? "Active ISP" : "No ISP"
  }
  if (item.held === 0) return "—"
  return `$${formatCurrency(item.held)}`
}

function formatNeeded(item: CoverageGapItem): string {
  if (item.coverageType === "hospitalization") {
    return "Active ISP"
  }
  if (item.coverageType === "personal_accident") {
    return "—"
  }
  if (item.needed === 0) return "—"
  return `$${formatCurrency(item.needed)}`
}

export function CoverageTable({ profiles, policies }: CoverageTableProps) {
  return (
    <div className="space-y-6">
      {profiles.map((profile) => {
        const profilePolicies = policies.filter(
          (p) => p.profile_id === profile.profileId && p.is_active,
        )

        return (
          <div key={profile.profileId} className="space-y-3">
            {profiles.length > 1 && (
              <h3 className="text-sm font-semibold">{profile.profileName}</h3>
            )}
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">
                        Coverage Type
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Policies
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Held
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Benchmark
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.items.map((item) => {
                      const matchingPolicies = profilePolicies.filter(
                        (p) =>
                          (p.coverages && p.coverages.length > 0
                            ? p.coverages.some((c) => c.coverage_type === item.coverageType)
                            : p.coverage_type === item.coverageType),
                      )
                      const recommendation = getCoverageRecommendation(item)

                      return (
                        <tr
                          key={item.coverageType}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{item.label}</div>
                            {recommendation && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {recommendation}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {matchingPolicies.length > 0
                              ? matchingPolicies
                                  .map((p) => p.name)
                                  .join(", ")
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {formatHeld(item)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {formatNeeded(item)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge item={item} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
