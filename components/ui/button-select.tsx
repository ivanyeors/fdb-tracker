"use client"

import * as React from "react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface ButtonSelectOption {
  value: string
  label: string
}

interface ButtonSelectProps {
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly options: ButtonSelectOption[]
  readonly className?: string
  readonly disabled?: boolean
}

function ButtonSelect({
  value,
  onValueChange,
  options,
  className,
  disabled,
}: ButtonSelectProps) {
  const instanceId = React.useId()

  return (
    <RadioGroup
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((option) => {
        const itemId = `${instanceId}-${option.value}`
        return (
        <div key={option.value}>
          <RadioGroupItem
            value={option.value}
            id={itemId}
            className="peer sr-only"
          />
          <Label
            htmlFor={itemId}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-muted bg-popover px-3 text-sm font-medium transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:text-primary",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
              "dark:peer-data-[state=checked]:bg-primary/20"
            )}
          >
            {option.label}
          </Label>
        </div>
        )
      })}
    </RadioGroup>
  )
}

export { ButtonSelect }
export type { ButtonSelectOption, ButtonSelectProps }
