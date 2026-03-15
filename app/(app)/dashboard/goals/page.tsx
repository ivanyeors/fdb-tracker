"use client"

import { useState, useEffect, useMemo } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { formatCurrency } from "@/lib/utils"
import { calculateMonthlyAuto } from "@/lib/calculations/savings-goals"
import { MetricCard } from "@/components/dashboard/metric-card"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Goal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  monthly_auto_amount: number
  deadline: string | null
  category: string
  created_at: string
}

export default function GoalsPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [goals, setGoals] = useState<Goal[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchGoals() {
      if (!activeProfileId && !activeFamilyId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const url = new URL("/api/goals", window.location.origin)
        if (activeProfileId) url.searchParams.set("profileId", activeProfileId)
        else if (activeFamilyId) url.searchParams.set("familyId", activeFamilyId)

        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          setGoals(json)
        }
      } catch (error) {
        console.error("Failed to fetch goals:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchGoals()
  }, [activeProfileId, activeFamilyId])

  const totalTarget = useMemo(() => goals.reduce((sum, g) => sum + g.target_amount, 0), [goals])
  const totalCurrent = useMemo(() => goals.reduce((sum, g) => sum + g.current_amount, 0), [goals])
  const totalProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Savings Goals"
        description="Track your progress towards your financial objectives."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading goals...
        </div>
      ) : goals.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No savings goals found.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Total Saved"
              value={totalCurrent}
              prefix="$"
            />
            <MetricCard
              label="Total Target"
              value={totalTarget}
              prefix="$"
            />
            <MetricCard
              label="Overall Progress"
              value={`${totalProgress.toFixed(1)}%`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-6">
            {goals.map((goal) => {
              const progressPct = goal.target_amount > 0 
                ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
                : 100
              
              const isCompleted = progressPct >= 100
              const suggestedMonthly = calculateMonthlyAuto(
                goal.target_amount,
                goal.current_amount,
                goal.deadline
              )

              return (
                <Card key={goal.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{goal.name}</CardTitle>
                        <CardDescription className="capitalize mt-1">
                          {goal.category}
                        </CardDescription>
                      </div>
                      {isCompleted && (
                        <Badge variant="default" className="bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400">
                          Achieved
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-end">
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-2xl font-bold">
                        ${formatCurrency(goal.current_amount)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        of ${formatCurrency(goal.target_amount)}
                      </span>
                    </div>
                    <Progress value={progressPct} className="h-2 mb-2" />
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
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
