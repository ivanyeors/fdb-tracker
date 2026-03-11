"use client"

import { useState, useEffect, useMemo } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Badge } from "@/components/ui/badge"

interface Policy {
  id: string
  name: string
  type: string
  premium_amount: number
  frequency: string
  yearly_outflow_date: number | null
  coverage_amount: number | null
  coverage_type: string | null
  is_active: boolean
  deduct_from_outflow: boolean
  created_at: string
}

export default function InsurancePage() {
  const { activeProfileId } = useActiveProfile()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchPolicies() {
      if (!activeProfileId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const url = new URL("/api/insurance", window.location.origin)
        url.searchParams.set("profileId", activeProfileId)

        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          setPolicies(json)
        }
      } catch (error) {
        console.error("Failed to fetch insurance:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPolicies()
  }, [activeProfileId])

  const activePolicies = useMemo(() => policies.filter(p => p.is_active), [policies])
  const totalAnnualPremium = useMemo(() => {
    return activePolicies.reduce((sum, p) => {
      const annual = p.frequency === "monthly" ? p.premium_amount * 12
        : p.frequency === "quarterly" ? p.premium_amount * 4
        : p.premium_amount
      return sum + annual
    }, 0)
  }, [activePolicies])
  const totalCoverage = useMemo(
    () => activePolicies.reduce((sum, p) => sum + (p.coverage_amount || 0), 0),
    [activePolicies],
  )

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Insurance"
        description="Coverage analysis, premiums, and gap detection."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading insurance policies...
        </div>
      ) : policies.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No insurance policies found for this profile.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Annual Premiums"
              value={totalAnnualPremium.toLocaleString()}
              prefix="$"
            />
            <MetricCard
              label="Total Coverage"
              value={totalCoverage.toLocaleString()}
              prefix="$"
            />
            <MetricCard
              label="Active Policies"
              value={`${activePolicies.length} of ${policies.length}`}
            />
          </div>

          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Policy</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Premium</th>
                    <th className="px-4 py-3 text-left font-medium">Frequency</th>
                    <th className="px-4 py-3 text-right font-medium">Coverage</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{policy.name}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {policy.type}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        ${policy.premium_amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {policy.frequency}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {policy.coverage_amount
                          ? `$${policy.coverage_amount.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={policy.is_active ? "default" : "secondary"}
                          className={
                            policy.is_active
                              ? "bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400"
                              : ""
                          }
                        >
                          {policy.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
