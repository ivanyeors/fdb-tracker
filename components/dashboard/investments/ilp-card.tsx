"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { LineChart, Line, ResponsiveContainer } from "recharts"

interface MonthlyData {
  month: string
  value: number
}

interface IlpCardProps {
  name: string
  fundValue: number
  totalPremiumsPaid: number
  returnPct: number
  monthlyPremium: number
  monthlyData: MonthlyData[]
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function IlpCard({
  name,
  fundValue,
  totalPremiumsPaid,
  returnPct,
  monthlyPremium,
  monthlyData,
}: IlpCardProps) {
  return (
    <Card className="h-[200px]">
      <CardHeader className="pb-0">
        <CardTitle className="text-base font-bold">{name}</CardTitle>
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
                stroke={returnPct >= 0 ? "#10b981" : "#ef4444"}
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
