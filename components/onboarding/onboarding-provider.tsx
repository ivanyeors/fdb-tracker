"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
  account_type: "ocbc_360" | "basic" | "savings" | "fixed_deposit" | "srs"
  opening_balance?: number
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

export interface CpfBalance {
  profileIndex: number
  oa: number
  sa: number
  ma: number
}

export interface OnboardingInvestment {
  type: "stock" | "gold" | "silver" | "ilp" | "etf" | "bond"
  symbol: string
  units: number
  cost_basis: number
  profileIndex: number
}

export interface OnboardingLoan {
  name: string
  type: "housing" | "personal" | "car" | "education"
  principal: number
  rate_pct: number
  tenure_months: number
  start_date: string
  lender?: string
  use_cpf_oa: boolean
  profileIndex: number
}

export interface OnboardingInsurance {
  name: string
  type: string
  premium_amount: number
  frequency: "monthly" | "yearly"
  coverage_amount?: number
  yearly_outflow_date?: number | null
  current_amount?: number | null
  end_date?: string | null
  inception_date?: string | null
  cpf_premium?: number | null
  profileIndex: number
}

export interface OnboardingIlp {
  name: string
  monthly_premium: number
  end_date: string
  profileIndex: number
}

export interface OnboardingTaxRelief {
  relief_type: string
  amount: number
  profileIndex: number
}

export type OnboardingMode = "first-time" | "new-family" | "resume"

export interface OnboardingState {
  mode: OnboardingMode
  userCount: number
  profiles: Profile[]
  incomeConfigs: IncomeConfig[]
  bankAccounts: BankAccount[]
  cpfBalances: CpfBalance[]
  telegramChatId: string
  promptSchedule: PromptScheduleConfig[]
  investments: OnboardingInvestment[]
  loans: OnboardingLoan[]
  insurancePolicies: OnboardingInsurance[]
  ilpProducts: OnboardingIlp[]
  taxReliefInputs: OnboardingTaxRelief[]
}

interface OnboardingContextValue extends OnboardingState {
  familyId: string | null
  isLoading: boolean
  setUserCount: (count: number) => void
  setProfiles: (profiles: Profile[]) => void
  setIncomeConfigs: (configs: IncomeConfig[]) => void
  setBankAccounts: (accounts: BankAccount[]) => void
  setCpfBalances: (balances: CpfBalance[]) => void
  setTelegramChatId: (chatId: string) => void
  setPromptSchedule: Dispatch<SetStateAction<PromptScheduleConfig[]>>
  setInvestments: Dispatch<SetStateAction<OnboardingInvestment[]>>
  setLoans: Dispatch<SetStateAction<OnboardingLoan[]>>
  setInsurancePolicies: Dispatch<SetStateAction<OnboardingInsurance[]>>
  setIlpProducts: Dispatch<SetStateAction<OnboardingIlp[]>>
  setTaxReliefInputs: Dispatch<SetStateAction<OnboardingTaxRelief[]>>
  setFamilyId: (id: string | null) => void
  skipOnboarding: () => Promise<void>
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

const ONBOARDING_STORAGE_KEY = "fdb-onboarding-draft"

function saveOnboardingDraft(state: OnboardingState & { familyId: string | null }) {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable
  }
}

function loadOnboardingDraft(): (OnboardingState & { familyId: string | null }) | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch {
    // ignore
  }
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function OnboardingProvider({
  children,
  mode: initialMode = "first-time",
}: {
  children: ReactNode
  mode?: OnboardingMode
}) {
  const router = useRouter()
  const [mode] = useState<OnboardingMode>(initialMode)
  const [isLoading, setIsLoading] = useState(true)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [userCount, setUserCount] = useState(1)
  const [profiles, setProfiles] = useState<Profile[]>([
    { name: "", birth_year: null },
  ])
  const [incomeConfigs, setIncomeConfigs] = useState<IncomeConfig[]>([
    { annual_salary: null, bonus_estimate: null, pay_frequency: "monthly" },
  ])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [cpfBalances, setCpfBalances] = useState<CpfBalance[]>([])
  const [telegramChatId, setTelegramChatId] = useState("")
  const [promptSchedule, setPromptSchedule] = useState<PromptScheduleConfig[]>(
    DEFAULT_PROMPT_SCHEDULE,
  )
  const [investments, setInvestments] = useState<OnboardingInvestment[]>([])
  const [loans, setLoans] = useState<OnboardingLoan[]>([])
  const [insurancePolicies, setInsurancePolicies] = useState<OnboardingInsurance[]>([])
  const [ilpProducts, setIlpProducts] = useState<OnboardingIlp[]>([])
  const [taxReliefInputs, setTaxReliefInputs] = useState<OnboardingTaxRelief[]>([])

  // Restore from localStorage immediately (before API call)
  useEffect(() => {
    const draft = loadOnboardingDraft()
    if (draft) {
      setUserCount(draft.userCount ?? 1)
      if (draft.profiles?.length) setProfiles(draft.profiles)
      if (draft.incomeConfigs?.length) setIncomeConfigs(draft.incomeConfigs)
      setBankAccounts(draft.bankAccounts ?? [])
      setCpfBalances(draft.cpfBalances ?? [])
      setTelegramChatId(draft.telegramChatId ?? "")
      if (draft.promptSchedule?.length) setPromptSchedule(draft.promptSchedule)
      setInvestments(draft.investments ?? [])
      setLoans(draft.loans ?? [])
      setInsurancePolicies(draft.insurancePolicies ?? [])
      setIlpProducts(draft.ilpProducts ?? [])
      setTaxReliefInputs(draft.taxReliefInputs ?? [])
      if (draft.familyId) setFamilyId(draft.familyId)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const url = `/api/onboarding/state?mode=${initialMode}`
        const res = await fetch(url)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        setUserCount(data.userCount ?? 1)
        setProfiles(
          data.profiles?.length
            ? data.profiles
            : [{ name: "", birth_year: null }],
        )
        setIncomeConfigs(
          data.incomeConfigs?.length
            ? data.incomeConfigs
            : [{ annual_salary: null, bonus_estimate: null, pay_frequency: "monthly" }],
        )
        setBankAccounts(data.bankAccounts ?? [])
        setCpfBalances(data.cpfBalances ?? [])
        setTelegramChatId(data.telegramChatId ?? "")
        setPromptSchedule(
          data.promptSchedule?.length
            ? data.promptSchedule
            : DEFAULT_PROMPT_SCHEDULE,
        )
        setInvestments(data.investments ?? [])
        setLoans(data.loans ?? [])
        setInsurancePolicies(data.insurancePolicies ?? [])
        setTaxReliefInputs(data.taxReliefInputs ?? [])
        setFamilyId(data.familyId ?? null)
      } catch {
        // Keep defaults on error (localStorage draft is already applied)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [initialMode])

  // Persist onboarding state to localStorage on every change
  useEffect(() => {
    saveOnboardingDraft({
      mode,
      userCount,
      profiles,
      incomeConfigs,
      bankAccounts,
      cpfBalances,
      telegramChatId,
      promptSchedule,
      investments,
      loans,
      insurancePolicies,
      ilpProducts,
      taxReliefInputs,
      familyId,
    })
  }, [
    mode, userCount, profiles, incomeConfigs, bankAccounts, cpfBalances,
    telegramChatId, promptSchedule, investments, loans, insurancePolicies,
    ilpProducts, taxReliefInputs, familyId,
  ])

  const skipOnboarding = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/skip", { method: "POST" })
      if (!res.ok) throw new Error("Failed to skip")
      clearOnboardingDraft()
      toast.success("Setup skipped — welcome to your dashboard")
      router.push("/dashboard")
    } catch {
      toast.error("Could not skip setup. Try again.")
    }
  }, [router])

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
        mode,
        userCount,
        profiles,
        incomeConfigs,
        bankAccounts,
        cpfBalances,
        telegramChatId,
        promptSchedule,
        investments,
        loans,
        insurancePolicies,
        ilpProducts,
        taxReliefInputs,
        familyId,
        isLoading,
        setUserCount: handleSetUserCount,
        setProfiles,
        setIncomeConfigs,
        setBankAccounts,
        setCpfBalances,
        setTelegramChatId,
        setPromptSchedule,
        setInvestments,
        setLoans,
        setInsurancePolicies,
        setIlpProducts,
        setTaxReliefInputs,
        setFamilyId,
        skipOnboarding,
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

export function pathWithMode(path: string, mode: OnboardingMode): string {
  if (mode === "first-time") return path
  const sep = path.includes("?") ? "&" : "?"
  return `${path}${sep}mode=${mode}`
}
