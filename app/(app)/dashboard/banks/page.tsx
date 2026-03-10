"use client"

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

const mockInterestCategories = [
  {
    category: "Base",
    requirement: "No requirement",
    met: true,
    rate: "0.05%",
  },
  {
    category: "Salary",
    requirement: "Credit salary ≥ $1,800/mth",
    met: true,
    rate: "2.00%",
  },
  {
    category: "Save",
    requirement: "Increase balance ≥ $500/mth",
    met: true,
    rate: "1.20%",
  },
  {
    category: "Spend",
    requirement: "Spend ≥ $500/mth on eligible card",
    met: false,
    rate: "0.60%",
  },
  {
    category: "Insure",
    requirement: "Qualifying OCBC insurance policy",
    met: true,
    rate: "1.20%",
  },
  {
    category: "Invest",
    requirement: "Unit trusts / structured deposits ≥ $20k",
    met: false,
    rate: "1.20%",
  },
  {
    category: "Grow",
    requirement: "Balance ≥ $200,000",
    met: false,
    rate: "2.40%",
  },
]

const projectedMonthlyInterest = 23.42

export default function BanksPage() {
  const qualifiedRate = mockInterestCategories
    .filter((c) => c.met)
    .reduce((sum, c) => sum + parseFloat(c.rate), 0)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Banks"
        description="Per-bank balances and OCBC 360 interest projection."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard
          label="OCBC 360"
          value="65,000"
          prefix="$"
          trend={1.9}
          trendLabel="+$1,200 vs last month"
          tooltipId="BANK_BALANCE"
        />
        <MetricCard
          label="DBS Savings"
          value="20,000"
          prefix="$"
          trend={0.5}
          trendLabel="+$100 vs last month"
          tooltipId="BANK_BALANCE"
        />
      </div>

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
                {mockInterestCategories.map((cat) => (
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
                      {cat.rate}
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
