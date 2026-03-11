"use client"

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

export interface Profile {
  name: string
  birth_year: number | null
}

export interface IncomeConfig {
  annual_salary: number | null
  bonus_estimate: number | null
  pay_frequency: "monthly" | "bi-monthly" | "weekly"
}

export interface BankAccount {
  bank_name: string
  account_type: "ocbc_360" | "basic" | "savings" | "fixed_deposit"
  savings_goals: SavingsGoal[]
}

export interface SavingsGoal {
  name: string
  target_amount: number | null
  current_amount: number
  deadline: string | null // ISO date "YYYY-MM-DD"
}

export interface PromptScheduleConfig {
  prompt_type: "end_of_month" | "income" | "insurance" | "tax"
  frequency: "monthly" | "yearly"
  day_of_month: number
  month_of_year: number | null
  time: string
  timezone: string
}

export interface OnboardingState {
  userCount: number
  profiles: Profile[]
  incomeConfigs: IncomeConfig[]
  bankAccounts: BankAccount[]
  telegramChatId: string
  promptSchedule: PromptScheduleConfig[]
}

interface OnboardingContextValue extends OnboardingState {
  setUserCount: (count: number) => void
  setProfiles: (profiles: Profile[]) => void
  setIncomeConfigs: (configs: IncomeConfig[]) => void
  setBankAccounts: (accounts: BankAccount[]) => void
  setTelegramChatId: (chatId: string) => void
  setPromptSchedule: Dispatch<SetStateAction<PromptScheduleConfig[]>>
}

const DEFAULT_PROMPT_SCHEDULE: PromptScheduleConfig[] = [
  {
    prompt_type: "end_of_month",
    frequency: "monthly",
    day_of_month: 28,
    month_of_year: null,
    time: "20:00",
    timezone: "Asia/Singapore",
  },
  {
    prompt_type: "income",
    frequency: "monthly",
    day_of_month: 1,
    month_of_year: null,
    time: "09:00",
    timezone: "Asia/Singapore",
  },
  {
    prompt_type: "insurance",
    frequency: "yearly",
    day_of_month: 1,
    month_of_year: 1,
    time: "09:00",
    timezone: "Asia/Singapore",
  },
  {
    prompt_type: "tax",
    frequency: "yearly",
    day_of_month: 1,
    month_of_year: 3,
    time: "09:00",
    timezone: "Asia/Singapore",
  },
]

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [userCount, setUserCount] = useState(1)
  const [profiles, setProfiles] = useState<Profile[]>([
    { name: "", birth_year: null },
  ])
  const [incomeConfigs, setIncomeConfigs] = useState<IncomeConfig[]>([
    { annual_salary: null, bonus_estimate: null, pay_frequency: "monthly" },
  ])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [telegramChatId, setTelegramChatId] = useState("")
  const [promptSchedule, setPromptSchedule] = useState<PromptScheduleConfig[]>(
    DEFAULT_PROMPT_SCHEDULE,
  )

  const handleSetUserCount = useCallback(
    (count: number) => {
      setUserCount(count)
      setProfiles((prev) => {
        if (prev.length === count) return prev
        if (prev.length < count) {
          return [
            ...prev,
            ...Array.from({ length: count - prev.length }, () => ({
              name: "",
              birth_year: null as number | null,
            })),
          ]
        }
        return prev.slice(0, count)
      })
      setIncomeConfigs((prev) => {
        if (prev.length === count) return prev
        if (prev.length < count) {
          return [
            ...prev,
            ...Array.from({ length: count - prev.length }, () => ({
              annual_salary: null as number | null,
              bonus_estimate: null as number | null,
              pay_frequency: "monthly" as const,
            })),
          ]
        }
        return prev.slice(0, count)
      })
    },
    [],
  )

  return (
    <OnboardingContext
      value={{
        userCount,
        profiles,
        incomeConfigs,
        bankAccounts,
        telegramChatId,
        promptSchedule,
        setUserCount: handleSetUserCount,
        setProfiles,
        setIncomeConfigs,
        setBankAccounts,
        setTelegramChatId,
        setPromptSchedule,
      }}
    >
      {children}
    </OnboardingContext>
  )
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider")
  }
  return ctx
}
