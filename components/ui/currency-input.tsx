"use client"

import * as React from "react"
import CurrencyInputLib from "react-currency-input-field"

import { cn } from "@/lib/utils"

export interface CurrencyInputProps
  extends Omit<
    React.ComponentProps<typeof CurrencyInputLib>,
    "value" | "onValueChange" | "onChange"
  > {
  value?: number | null
  onChange?: (value: number | null) => void
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <CurrencyInputLib
        ref={ref}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        decimalsLimit={2}
        decimalScale={2}
        groupSeparator=","
        decimalSeparator="."
        allowNegativeValue={false}
        value={value ?? ""}
        onValueChange={(_value, _name, values) => {
          onChange?.(values?.float ?? null)
        }}
        {...props}
      />
    )
  }
)

CurrencyInput.displayName = "CurrencyInput"

export { CurrencyInput }
