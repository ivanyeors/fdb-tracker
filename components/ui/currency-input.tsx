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

function normalizedValue(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) {
    return undefined
  }
  return value
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      className,
      value,
      onChange,
      placeholder = "0.00",
      allowNegativeValue = false,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [localValue, setLocalValue] = React.useState<string | undefined>(
      undefined,
    )

    const displayValue =
      isFocused && localValue !== undefined
        ? localValue
        : normalizedValue(value)

    return (
      <CurrencyInputLib
        ref={ref}
        data-slot="input"
        {...props}
        placeholder={placeholder}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className,
        )}
        value={displayValue}
        onValueChange={(val, _name, values) => {
          if (isFocused) {
            setLocalValue(val ?? "")
          }
          const f = values?.float
          onChange?.(f != null && Number.isFinite(f) ? f : null)
        }}
        onFocus={(e) => {
          setIsFocused(true)
          setLocalValue(
            value != null && Number.isFinite(value) ? String(value) : "",
          )
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setIsFocused(false)
          setLocalValue(undefined)
          onBlur?.(e)
        }}
        transformRawValue={(raw) => {
          if (!raw) return raw
          // Comma as decimal (e.g. "1500,25" or "1,5") -> convert to period
          return raw.replaceAll(/(\d),(\d{1,2})(?=\D|$)/g, "$1.$2")
        }}
        allowDecimals={true}
        decimalsLimit={2}
        decimalScale={2}
        groupSeparator=","
        decimalSeparator="."
        allowNegativeValue={allowNegativeValue}
        inputMode="decimal"
      />
    )
  },
)

CurrencyInput.displayName = "CurrencyInput"

export { CurrencyInput }
