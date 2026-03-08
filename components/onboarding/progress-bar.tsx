"use client"

import { Progress } from "@/components/ui/progress"

interface ProgressBarProps {
  currentStep: number
  totalSteps?: number
}

export function ProgressBar({
  currentStep,
  totalSteps = 8,
}: ProgressBarProps) {
  const percentage = Math.round((currentStep / totalSteps) * 100)

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Step {currentStep} of {totalSteps}
      </p>
      <Progress value={percentage} className="h-2" />
    </div>
  )
}
