"use client"

import { Progress } from "@/components/ui/progress"

interface ProgressBarProps {
  currentStep: number
  totalSteps?: number
  requiredSteps?: number
  optionalSteps?: number
}

export function ProgressBar({
  currentStep,
  totalSteps = 8,
  requiredSteps,
  optionalSteps,
}: ProgressBarProps) {
  const total = totalSteps
  const percentage = Math.round((currentStep / total) * 100)
  const isOptional = requiredSteps != null && optionalSteps != null && currentStep > requiredSteps

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {requiredSteps != null && optionalSteps != null ? (
          <>
            Step {currentStep} of {total}
            {isOptional && (
              <span className="ml-1 text-muted-foreground/80">
                (optional)
              </span>
            )}
          </>
        ) : (
          `Step ${currentStep} of ${total}`
        )}
      </p>
      <Progress value={percentage} className="h-2" />
    </div>
  )
}
