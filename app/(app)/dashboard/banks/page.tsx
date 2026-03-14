"use client"

import { useState, useEffect } from "react"
import { Check, X } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { useActiveProfile } from "@/hooks/use-active-profile"

const OCBC360_CATEGORIES = [
  { category: "Base", requirement: "No requirement", rate: 0.05, key: null },
  {
    category: "Salary",
    requirement: "Credit salary ≥ $1,800/mth",
    rate: 2.0,
    key: "salary_met" as const,
  },
  {
    category: "Save",
    requirement: "Increase balance ≥ $500/mth",
    rate: 1.2,
    key: "save_met" as const,
  },
  {
    category: "Spend",
    requirement: "Spend ≥ $500/mth on eligible card",
    rate: 0.6,
    key: "spend_met" as const,
  },
  {
    category: "Insure",
    requirement: "Qualifying OCBC insurance policy",
    rate: 1.2,
    key: "insure_met" as const,
  },
  {
    category: "Invest",
    requirement: "Unit trusts / structured deposits ≥ $20k",
    rate: 1.2,
    key: "invest_met" as const,
  },
  {
    category: "Grow",
    requirement: "Balance ≥ $200,000",
    rate: 2.4,
    key: "grow_met" as const,
  },
]

export default function BanksPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [accounts, setAccounts] = useState<
    Array<{
      id?: string
      bank_name?: string
      account_type?: string
      latest_balance?: number
      opening_balance?: number
      ocbc360Config?: Record<string, unknown> | null
    }>
  >([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchBanks() {
      setIsLoading(true)
      try {
        const url = new URL("/api/bank-accounts", window.location.origin)
        if (activeProfileId) url.searchParams.set("profileId", activeProfileId)
        else if (activeFamilyId) url.searchParams.set("familyId", activeFamilyId)
        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          setAccounts(Array.isArray(json) ? json : json.accounts ?? [])
        }
      } catch (error) {
        console.error("Failed to fetch bank accounts:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchBanks()
  }, [activeProfileId, activeFamilyId])

  const ocbc360Account = accounts.find(
    (a) => a.account_type === "ocbc_360" && a.ocbc360Config,
  )
  const ocbcConfig = ocbc360Account?.ocbc360Config as Record<string, boolean> | null

  const interestCategories = OCBC360_CATEGORIES.map((c) => ({
    ...c,
    met: c.key === null ? true : (ocbcConfig?.[c.key] ?? false),
    rateLabel: `${c.rate}%`,
  }))

  const qualifiedRate = interestCategories
    .filter((c) => c.met)
    .reduce((sum, c) => sum + c.rate, 0)

  const ocbc360Balance =
    ocbc360Account != null
      ? (ocbc360Account.latest_balance ?? ocbc360Account.opening_balance ?? 0)
      : 0
  const projectedMonthlyInterest =
    (ocbc360Balance * (qualifiedRate / 100)) / 12

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Banks"
        description="Per-bank balances and OCBC 360 interest projection."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading accounts...
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No bank accounts found for this profile.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accounts.map((acc, i) => (
            <MetricCard
              key={acc.id || i}
              label={acc.bank_name || "Bank Account"}
              value={acc.latest_balance ?? acc.opening_balance ?? 0}
              prefix="$"
              trend={0}
              trendLabel="vs last month"
              tooltipId="BANK_BALANCE"
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>OCBC 360 Interest Breakdown</CardTitle>
          <CardDescription>
            Effective rate: {qualifiedRate.toFixed(2)}% &middot; Projected:{" "}
            <span className="font-semibold text-foreground">
              ${projectedMonthlyInterest.toFixed(2)}/month
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Requirement</th>
                  <th className="pb-2 pr-4 text-center font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {interestCategories.map((cat) => (
                  <tr key={cat.category} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{cat.category}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {cat.requirement}
                    </td>
                    <td className="py-2.5 pr-4 text-center">
                      {cat.met ? (
                        <Check className="mx-auto size-4 text-emerald-500" />
                      ) : (
                        <X className="mx-auto size-4 text-muted-foreground/50" />
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {cat.rateLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
