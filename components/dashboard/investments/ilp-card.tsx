"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { LineChart, Line, ResponsiveContainer } from "recharts"
import { AddIlpEntryDialog } from "@/components/dashboard/investments/add-ilp-entry-dialog"
import { EditIlpDialog } from "@/components/dashboard/investments/edit-ilp-dialog"

interface MonthlyData {
  month: string
  value: number
}

interface IlpCardProps {
  productId?: string
  name: string
  fundValue: number
  totalPremiumsPaid: number
  returnPct: number
  monthlyPremium: number
  endDate?: string
  monthlyData: MonthlyData[]
  onAddEntry?: () => void
  onEditSuccess?: () => void
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function IlpCard({
  productId,
  name,
  fundValue,
  totalPremiumsPaid,
  returnPct,
  monthlyPremium,
  endDate,
  monthlyData,
  onAddEntry,
  onEditSuccess,
}: IlpCardProps) {
  return (
    <Card className="h-[200px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-base font-bold">{name}</CardTitle>
        {productId && (
          <div className="flex items-center gap-1">
            <EditIlpDialog
              productId={productId}
              productName={name}
              monthlyPremium={monthlyPremium}
              endDate={endDate ?? ""}
              onSuccess={onEditSuccess ?? onAddEntry}
            />
            <AddIlpEntryDialog
              productId={productId}
              productName={name}
              onSuccess={onAddEntry}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fund Value</span>
            <span className="font-medium">${fmt(fundValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Premiums Paid</span>
            <span className="font-medium">${fmt(totalPremiumsPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Return</span>
            <span
              className={cn(
                "font-medium",
                returnPct >= 0 ? "text-emerald-500" : "text-red-500",
              )}
            >
              {returnPct >= 0 ? "+" : ""}
              {fmt(returnPct)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly Premium</span>
            <span className="font-medium">${fmt(monthlyPremium)}</span>
          </div>
        </div>
        <div className="h-16 w-24 self-center">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={returnPct >= 0 ? "var(--color-chart-positive)" : "var(--color-chart-negative)"}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
