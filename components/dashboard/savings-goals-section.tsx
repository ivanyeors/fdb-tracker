"use client"

import { useMemo } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { formatCurrency } from "@/lib/utils"
import { calculateMonthlyAuto } from "@/lib/calculations/savings-goals"
import { MetricCard } from "@/components/dashboard/metric-card"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useApi } from "@/hooks/use-api"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface GoalContribution {
  id: string
  amount: number
  source: string
  created_at: string
}

interface Goal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  monthly_auto_amount: number
  deadline: string | null
  category: string
  linked_bank_account_id: string | null
  created_at: string
  goal_contributions: GoalContribution[]
}

export function SavingsGoalsSection() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()

  const apiPath = (() => {
    if (activeProfileId) return `/api/goals?profileId=${activeProfileId}`
    if (activeFamilyId) return `/api/goals?familyId=${activeFamilyId}`
    return null
  })()

  const { data: goals = [], isLoading } = useApi<Goal[]>(apiPath)

  const totalTarget = useMemo(
    () => goals.reduce((sum, g) => sum + g.target_amount, 0),
    [goals],
  )
  const totalCurrent = useMemo(
    () => goals.reduce((sum, g) => sum + g.current_amount, 0),
    [goals],
  )
  const totalProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0

  return (
    <div id="savings-goals" className="space-y-6 scroll-mt-6">
      <SectionHeader
        title="Savings Goals"
        description="Track your progress towards your financial objectives."
      />

      {(() => {
        if (isLoading) {
          return (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={`goal-skeleton-${i}`} className="flex flex-col">
                <CardHeader className="pb-3">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="mt-2 h-4 w-24" />
                </CardHeader>
                <CardContent className="flex-1">
                  <Skeleton className="mb-2 h-8 w-24" />
                  <Skeleton className="mb-2 h-2 w-full" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
          )
        }
        if (goals.length === 0) {
          return (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No savings goals found.
        </div>
          )
        }
        return (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Total Saved" value={totalCurrent} prefix="$" />
            <MetricCard label="Total Target" value={totalTarget} prefix="$" />
            <MetricCard
              label="Overall Progress"
              value={`${totalProgress.toFixed(1)}%`}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => {
              const progressPct =
                goal.target_amount > 0
                  ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
                  : 100

              const isCompleted = progressPct >= 100
              const suggestedMonthly = calculateMonthlyAuto(
                goal.target_amount,
                goal.current_amount,
                goal.deadline,
              )
              const recentContributions = (goal.goal_contributions ?? [])
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )
                .slice(0, 3)

              return (
                <Card key={goal.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{goal.name}</CardTitle>
                        <CardDescription className="mt-1 capitalize">
                          {goal.category}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        {goal.linked_bank_account_id && (
                          <Badge
                            variant="outline"
                            className="text-blue-600 dark:text-blue-400"
                          >
                            Synced
                          </Badge>
                        )}
                        {isCompleted && (
                          <Badge
                            variant="default"
                            className="bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400"
                          >
                            Achieved
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-end">
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-2xl font-bold">
                        ${formatCurrency(goal.current_amount)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        of ${formatCurrency(goal.target_amount)}
                      </span>
                    </div>
                    <Progress value={progressPct} className="mb-2 h-2" />
                    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>{progressPct.toFixed(1)}%</span>
                        {goal.deadline && (
                          <span>
                            Target: {new Date(goal.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {suggestedMonthly != null && (
                        <span>
                          Suggested monthly: ${formatCurrency(suggestedMonthly)}
                        </span>
                      )}
                    </div>
                    {recentContributions.length > 0 && (
                      <div className="mt-3 border-t pt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Recent Contributions
                        </p>
                        <div className="space-y-1">
                          {recentContributions.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-muted-foreground">
                                {new Date(c.created_at).toLocaleDateString()}
                                {c.source !== "telegram" && (
                                  <span className="ml-1 capitalize">
                                    ({c.source})
                                  </span>
                                )}
                              </span>
                              <span className="font-medium text-green-600 dark:text-green-400">
                                +${formatCurrency(c.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
        )
      })()}
    </div>
  )
}
