"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  type DisplayCurrency,
  formatMoneyFromSgd,
} from "@/lib/investments/display-currency"
import { formatCurrency } from "@/lib/utils"

const STORAGE_KEY = "investments-display-currency"

type ContextValue = {
  /** User preference (may be USD while FX is still loading or unavailable). */
  displayCurrency: DisplayCurrency
  /** Currency used for formatting and chart scaling (USD only when rate is usable). */
  effectiveDisplayCurrency: DisplayCurrency
  setDisplayCurrency: (c: DisplayCurrency) => void
  sgdPerUsd: number | null
  fxLoading: boolean
  /** Format a value stored in SGD for the current display mode. */
  formatMoney: (sgdAmount: number) => string
  canShowUsd: boolean
}

const InvestmentsDisplayCurrencyContext = createContext<ContextValue | null>(
  null,
)

export function InvestmentsDisplayCurrencyProvider({
  children,
  sgdPerUsd,
  fxLoading,
}: {
  readonly children: ReactNode
  readonly sgdPerUsd: number | null
  readonly fxLoading: boolean
}) {
  const [displayCurrency, setDisplayCurrencyState] =
    useState<DisplayCurrency>("SGD")

  // Hydration-safe: server and first client paint match; then restore preference.
  useEffect(() => {
    try {
      const v = globalThis.localStorage.getItem(STORAGE_KEY)
      if (v === "USD") {
        queueMicrotask(() => setDisplayCurrencyState("USD"))
      }
    } catch {
      /* ignore */
    }
  }, [])

  const setDisplayCurrency = useCallback((c: DisplayCurrency) => {
    setDisplayCurrencyState(c)
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, c)
    } catch {
      /* ignore */
    }
  }, [])

  const canShowUsd =
    !fxLoading && sgdPerUsd != null && sgdPerUsd > 0

  const effectiveDisplayCurrency: DisplayCurrency =
    displayCurrency === "USD" && canShowUsd ? "USD" : "SGD"

  const formatMoney = useCallback(
    (sgdAmount: number) =>
      formatMoneyFromSgd(sgdAmount, effectiveDisplayCurrency, sgdPerUsd),
    [effectiveDisplayCurrency, sgdPerUsd],
  )

  const value = useMemo<ContextValue>(
    () => ({
      displayCurrency,
      effectiveDisplayCurrency,
      setDisplayCurrency,
      sgdPerUsd,
      fxLoading,
      formatMoney,
      canShowUsd,
    }),
    [
      displayCurrency,
      effectiveDisplayCurrency,
      setDisplayCurrency,
      sgdPerUsd,
      fxLoading,
      formatMoney,
      canShowUsd,
    ],
  )

  return (
    <InvestmentsDisplayCurrencyContext.Provider value={value}>
      {children}
    </InvestmentsDisplayCurrencyContext.Provider>
  )
}

export function useInvestmentsDisplayCurrency(): ContextValue {
  const ctx = useContext(InvestmentsDisplayCurrencyContext)
  if (!ctx) {
    return {
      displayCurrency: "SGD",
      effectiveDisplayCurrency: "SGD",
      setDisplayCurrency: () => {},
      sgdPerUsd: null,
      fxLoading: false,
      formatMoney: (sgdAmount: number) => `S$${formatCurrency(sgdAmount)}`,
      canShowUsd: false,
    }
  }
  return ctx
}

export function InvestmentsCurrencyToggle() {
  const {
    effectiveDisplayCurrency,
    setDisplayCurrency,
    canShowUsd,
    fxLoading,
  } = useInvestmentsDisplayCurrency()

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        {(["SGD", "USD"] as const).map((c) => {
          const isUsd = c === "USD"
          const disabled = isUsd && (!canShowUsd || fxLoading)
          return (
            <button
              key={c}
              type="button"
              disabled={disabled}
              title={
                disabled && isUsd
                  ? "USD view needs a live USD/SGD rate"
                  : undefined
              }
              onClick={() => {
                if (!disabled) setDisplayCurrency(c)
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                effectiveDisplayCurrency === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {c}
            </button>
          )
        })}
      </div>
      {!canShowUsd && !fxLoading ? (
        <p className="max-w-[14rem] text-right text-[10px] text-muted-foreground">
          USD view unavailable (no FX rate).
        </p>
      ) : null}
    </div>
  )
}
