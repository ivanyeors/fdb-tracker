"use client"

/* eslint-disable react-hooks/set-state-in-effect -- sync UI state with server action results and prop changes */
import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  useOptionalUserSettingsSave,
  useUserSettingsSave,
  useUserSettingsSaveRegistration,
} from "@/components/layout/user-settings-save-context"
import { useActiveProfile } from "@/hooks/use-active-profile"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ui/responsive-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DatePicker } from "@/components/ui/date-picker"
import { Textarea } from "@/components/ui/textarea"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SymbolPickerDrawer } from "@/components/dashboard/investments/symbol-picker-drawer"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { cn, formatCurrency } from "@/lib/utils"
import {
  getFieldsForInsurancePolicyRow,
  ISP_SUB_TYPES,
  INSURANCE_TYPE_LABELS,
  COVERAGE_TYPE_LABELS,
  DEFAULT_COVERAGES_BY_POLICY,
  ALLOWED_COVERAGES_BY_POLICY,
  SUGGESTED_BENEFITS_BY_POLICY,
  mapBenefitToStandardCoverage,
  BENEFIT_UNITS,
  type InsuranceType,
  type CoverageType,
} from "@/lib/insurance/coverage-config"
import {
  updateUserProfile,
  deleteUserProfile,
  createProfile,
  updateFamilyName,
  deleteFamily,
} from "../actions"
import { calculateMonthlyAuto } from "@/lib/calculations/savings-goals"
import { toast } from "sonner"
import { Loader2, Trash2, UserPlus, ExternalLink, Plus, FileText, X, Pencil, ChevronRight } from "lucide-react"
import type { ProfileWithIncome } from "./types"

const ACCOUNT_TYPES = [
  { value: "ocbc_360", label: "OCBC 360" },
  { value: "basic", label: "Basic Savings" },
  { value: "savings", label: "Savings" },
  { value: "fixed_deposit", label: "Fixed Deposit" },
  { value: "srs", label: "SRS" },
] as const

const INVESTMENT_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "bond", label: "Bond" },
  { value: "ilp", label: "ILP" },
] as const

type InvestmentKind = (typeof INVESTMENT_TYPES)[number]["value"]

const GOAL_CATEGORIES = [
  { value: "custom", label: "Custom" },
  { value: "dream_home", label: "Dream Home" },
  { value: "gadget", label: "Gadget" },
  { value: "travel", label: "Travel" },
  { value: "wardrobe", label: "Wardrobe" },
  { value: "car", label: "Car" },
] as const

const LOAN_TYPES = [
  { value: "housing", label: "Housing" },
  { value: "personal", label: "Personal" },
  { value: "car", label: "Car" },
  { value: "education", label: "Education" },
] as const

const INSURANCE_TYPES_FOR_NEW = [
  { value: "term_life" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.term_life },
  { value: "whole_life" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.whole_life },
  { value: "universal_life" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.universal_life },
  { value: "integrated_shield" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.integrated_shield },
  { value: "critical_illness" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.critical_illness },
  { value: "early_critical_illness" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.early_critical_illness },
  { value: "multi_pay_ci" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.multi_pay_ci },
  { value: "endowment" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.endowment },
  { value: "personal_accident" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.personal_accident },
  { value: "disability_income" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.disability_income },
  { value: "long_term_care" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.long_term_care },
  { value: "tpd" satisfies InsuranceType, label: INSURANCE_TYPE_LABELS.tpd },
] as const

const INSURANCE_TYPE_LEGACY_ILP = {
  value: "ilp" as const,
  label: "ILP (legacy — use Investments)",
}

function insuranceTypeSelectItems(currentRowType: string) {
  if (currentRowType === "ilp") {
    return [...INSURANCE_TYPES_FOR_NEW, INSURANCE_TYPE_LEGACY_ILP] as const
  }
  return INSURANCE_TYPES_FOR_NEW
}

export type FinancialDataByFamily = {
  bankAccounts: Array<{
    id: string
    bank_name: string
    account_type: string
    opening_balance: number
    interest_rate_pct: number | null
    locked_amount?: number
    profile_id: string | null
  }>
  savingsGoals: Array<{
    id: string
    name: string
    target_amount: number
    current_amount: number
    monthly_auto_amount: number
    deadline: string | null
    category: string
    linked_bank_account_id: string | null
    profile_id: string | null
  }>
  investments: Array<{
    id: string
    symbol: string
    type: string
    units: number
    cost_basis: number
    target_allocation_pct: number | null
    profile_id: string | null
    current_price: number | null
    market_value: number | null
    unrealised_pnl: number | null
    unrealised_pnl_pct: number | null
  }>
  loans: Array<{
    id: string
    name: string
    type: string
    principal: number
    rate_pct: number
    tenure_months: number
    start_date: string
    lender: string | null
    use_cpf_oa: boolean
    valuation_limit: number | null
    profile_id: string
  }>
  insurancePolicies: Array<{
    id: string
    name: string
    type: string
    premium_amount: number
    frequency: string
    coverage_amount: number | null
    yearly_outflow_date: number | null
    current_amount: number | null
    end_date: string | null
    profile_id: string
    sub_type: string | null
    rider_name: string | null
    rider_premium: number | null
    insurer: string | null
    policy_number: string | null
    maturity_value: number | null
    cash_value: number | null
    coverage_till_age: number | null
    inception_date: string | null
    cpf_premium: number | null
    premium_waiver: boolean
    remarks: string | null
    coverages: Array<{
      id: string
      coverage_type: string | null
      coverage_amount: number
      benefit_name: string | null
      benefit_premium: number | null
      renewal_bonus: number | null
      benefit_expiry_date: string | null
      benefit_unit: string | null
      sort_order: number
    }>
  }>
  cpfBalances: Array<{
    id: string
    profile_id: string
    month: string
    oa: number
    sa: number
    ma: number
  }>
  monthlyCashflow: Array<{
    id: string
    profile_id: string
    month: string
    inflow: number
    outflow: number
  }>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold mb-2 mt-6 first:mt-0">{children}</h3>
  )
}

function SectionGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-8 mb-3 first:mt-0">
      {children}
    </h3>
  )
}

function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string
  badge?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/section">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-muted/60">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/section:rotate-90" />
        <span className="flex-1">{title}</span>
        {badge && (
          <Badge variant="secondary" className="text-[11px] font-normal">
            {badge}
          </Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="overflow-hidden data-[state=closed]:hidden">
        <div className="pt-3 pb-1">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ScrollableTableWrapper({
  minWidth,
  children,
}: {
  minWidth: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div style={{ minWidth }}>{children}</div>
    </div>
  )
}

function EmptyState({ noun, onAdd }: { noun: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
      <p className="text-sm text-muted-foreground">No {noun} yet.</p>
      {onAdd && (
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      )}
    </div>
  )
}

function profileEmployeeCpfInputString(profile: ProfileWithIncome): string {
  const r = profile.income_config?.employee_cpf_rate
  return r != null ? String(r) : ""
}

function bankRowDirty(
  e: FinancialDataByFamily["bankAccounts"][0],
  b: FinancialDataByFamily["bankAccounts"][0]
): boolean {
  return (
    e.bank_name !== b.bank_name ||
    e.account_type !== b.account_type ||
    e.opening_balance !== b.opening_balance ||
    (e.interest_rate_pct ?? null) !== (b.interest_rate_pct ?? null) ||
    (e.locked_amount ?? 0) !== (b.locked_amount ?? 0) ||
    e.profile_id !== b.profile_id
  )
}

function goalRowDirty(
  e: FinancialDataByFamily["savingsGoals"][0],
  g: FinancialDataByFamily["savingsGoals"][0]
): boolean {
  return (
    e.name !== g.name ||
    e.target_amount !== g.target_amount ||
    e.current_amount !== g.current_amount ||
    e.monthly_auto_amount !== g.monthly_auto_amount ||
    (e.deadline ?? null) !== (g.deadline ?? null) ||
    e.category !== g.category ||
    (e.linked_bank_account_id ?? null) !== (g.linked_bank_account_id ?? null) ||
    e.profile_id !== g.profile_id
  )
}

function invRowDirty(
  e: FinancialDataByFamily["investments"][0],
  i: FinancialDataByFamily["investments"][0]
): boolean {
  return (
    e.symbol !== i.symbol ||
    e.type !== i.type ||
    e.units !== i.units ||
    e.cost_basis !== i.cost_basis ||
    (e.target_allocation_pct ?? null) !== (i.target_allocation_pct ?? null) ||
    e.profile_id !== i.profile_id
  )
}

function loanRowDirty(
  e: FinancialDataByFamily["loans"][0],
  l: FinancialDataByFamily["loans"][0]
): boolean {
  return (
    e.name !== l.name ||
    e.type !== l.type ||
    e.principal !== l.principal ||
    e.rate_pct !== l.rate_pct ||
    e.tenure_months !== l.tenure_months ||
    e.start_date !== l.start_date ||
    (e.lender ?? null) !== (l.lender ?? null) ||
    e.use_cpf_oa !== l.use_cpf_oa ||
    (e.valuation_limit ?? null) !== (l.valuation_limit ?? null)
  )
}

function coveragesDirty(
  a: FinancialDataByFamily["insurancePolicies"][0]["coverages"],
  b: FinancialDataByFamily["insurancePolicies"][0]["coverages"],
): boolean {
  if (a.length !== b.length) return true
  const key = (c: (typeof a)[0]) => `${c.coverage_type ?? ""}|${c.benefit_name ?? ""}|${c.sort_order}`
  const sortedA = [...a].sort((x, y) => key(x).localeCompare(key(y)))
  const sortedB = [...b].sort((x, y) => key(x).localeCompare(key(y)))
  return sortedA.some(
    (ac, i) =>
      ac.coverage_type !== sortedB[i].coverage_type ||
      ac.coverage_amount !== sortedB[i].coverage_amount ||
      (ac.benefit_name ?? null) !== (sortedB[i].benefit_name ?? null) ||
      (ac.benefit_premium ?? null) !== (sortedB[i].benefit_premium ?? null) ||
      (ac.renewal_bonus ?? null) !== (sortedB[i].renewal_bonus ?? null) ||
      (ac.benefit_expiry_date ?? null) !== (sortedB[i].benefit_expiry_date ?? null) ||
      (ac.benefit_unit ?? null) !== (sortedB[i].benefit_unit ?? null),
  )
}

function insuranceRowDirty(
  e: FinancialDataByFamily["insurancePolicies"][0],
  p: FinancialDataByFamily["insurancePolicies"][0],
): boolean {
  return (
    e.name !== p.name ||
    e.type !== p.type ||
    e.premium_amount !== p.premium_amount ||
    e.frequency !== p.frequency ||
    (e.coverage_amount ?? null) !== (p.coverage_amount ?? null) ||
    (e.yearly_outflow_date ?? null) !== (p.yearly_outflow_date ?? null) ||
    (e.current_amount ?? null) !== (p.current_amount ?? null) ||
    (e.end_date ?? null) !== (p.end_date ?? null) ||
    (e.sub_type ?? null) !== (p.sub_type ?? null) ||
    (e.rider_name ?? null) !== (p.rider_name ?? null) ||
    (e.rider_premium ?? null) !== (p.rider_premium ?? null) ||
    (e.insurer ?? null) !== (p.insurer ?? null) ||
    (e.policy_number ?? null) !== (p.policy_number ?? null) ||
    (e.maturity_value ?? null) !== (p.maturity_value ?? null) ||
    (e.cash_value ?? null) !== (p.cash_value ?? null) ||
    (e.coverage_till_age ?? null) !== (p.coverage_till_age ?? null) ||
    (e.inception_date ?? null) !== (p.inception_date ?? null) ||
    (e.cpf_premium ?? null) !== (p.cpf_premium ?? null) ||
    (e.premium_waiver ?? false) !== (p.premium_waiver ?? false) ||
    (e.remarks ?? null) !== (p.remarks ?? null) ||
    coveragesDirty(e.coverages, p.coverages)
  )
}

function ProfileSection({
  profile,
  profileCount,
  onDirtyChange,
}: {
  profile: ProfileWithIncome
  profileCount: number
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteUserProfile, {
    success: false,
    error: undefined,
  })

  const [name, setName] = useState(profile.name)
  const [birthYear, setBirthYear] = useState(profile.birth_year)
  const [annualSalary, setAnnualSalary] = useState(profile.income_config?.annual_salary ?? 0)
  const [bonusEstimate, setBonusEstimate] = useState(profile.income_config?.bonus_estimate ?? 0)
  const [payFrequency, setPayFrequency] = useState(profile.income_config?.pay_frequency ?? "monthly")
  const [employeeCpfRate, setEmployeeCpfRate] = useState<string>(
    profile.income_config?.employee_cpf_rate != null
      ? String(profile.income_config.employee_cpf_rate)
      : ""
  )
  const [dpsInclude, setDpsInclude] = useState(profile.dps_include_in_projection !== false)
  const [maritalStatus, setMaritalStatus] = useState(profile.marital_status ?? "")
  const [numDependents, setNumDependents] = useState(profile.num_dependents ?? 0)

  const isDirty = useMemo(() => {
    const baselineCpf = profileEmployeeCpfInputString(profile)
    const dpsBaseline = profile.dps_include_in_projection !== false
    return (
      name !== profile.name ||
      birthYear !== profile.birth_year ||
      annualSalary !== (profile.income_config?.annual_salary ?? 0) ||
      bonusEstimate !== (profile.income_config?.bonus_estimate ?? 0) ||
      payFrequency !== (profile.income_config?.pay_frequency ?? "monthly") ||
      employeeCpfRate !== baselineCpf ||
      dpsInclude !== dpsBaseline ||
      maritalStatus !== (profile.marital_status ?? "") ||
      numDependents !== (profile.num_dependents ?? 0)
    )
  }, [
    name,
    birthYear,
    annualSalary,
    bonusEstimate,
    payFrequency,
    employeeCpfRate,
    dpsInclude,
    maritalStatus,
    numDependents,
    profile,
  ])

  const saveProfile = useCallback(async () => {
    const fd = new FormData()
    fd.set("profileId", profile.id)
    fd.set("name", name)
    fd.set("birthYear", String(birthYear))
    fd.set("annualSalary", String(annualSalary))
    fd.set("bonusEstimate", String(bonusEstimate))
    fd.set("payFrequency", payFrequency)
    fd.set("employeeCpfRate", employeeCpfRate || "")
    fd.set("dpsIncludeInProjection", dpsInclude ? "true" : "false")
    fd.set("maritalStatus", maritalStatus)
    fd.set("numDependents", String(numDependents))
    const result = await updateUserProfile({ success: false }, fd)
    if (result.error) throw new Error(result.error)
  }, [
    profile.id,
    name,
    birthYear,
    annualSalary,
    bonusEstimate,
    payFrequency,
    employeeCpfRate,
    dpsInclude,
    maritalStatus,
    numDependents,
  ])

  useUserSettingsSaveRegistration(`user-settings-profile-${profile.id}`, isDirty, saveProfile)

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    if (deleteState.success) {
      setDeleteDialogOpen(false)
      toast.success(`${profile.name}'s profile was deleted`)
    } else if (deleteState.error) {
      toast.error(deleteState.error)
    }
  }, [deleteState, profile.name])

  useEffect(() => {
    setName(profile.name)
    setBirthYear(profile.birth_year)
    setAnnualSalary(profile.income_config?.annual_salary ?? 0)
    setBonusEstimate(profile.income_config?.bonus_estimate ?? 0)
    setPayFrequency(profile.income_config?.pay_frequency ?? "monthly")
    setEmployeeCpfRate(
      profile.income_config?.employee_cpf_rate != null
        ? String(profile.income_config.employee_cpf_rate)
        : ""
    )
    setDpsInclude(profile.dps_include_in_projection !== false)
    setMaritalStatus(profile.marital_status ?? "")
    setNumDependents(profile.num_dependents ?? 0)
  }, [profile.id, profile.name, profile.birth_year, profile.income_config, profile.dps_include_in_projection, profile.marital_status, profile.num_dependents])

  const canDelete = profileCount > 1

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard?profileId=${profile.id}`}>
              <ExternalLink className="h-4 w-4" />
              <span className="sr-only">Manage financial data</span>
            </Link>
          </Button>
          {canDelete && (
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete profile</span>
              </Button>
              <DialogContent showCloseButton={true}>
                <DialogHeader>
                  <DialogTitle>Delete profile</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete {profile.name}? This will remove their profile and
                    associated data (income config, cashflow, CPF, loans, insurance, etc.). Bank accounts
                    and investments linked to this profile will be unlinked but not deleted.
                  </DialogDescription>
                </DialogHeader>
                <form action={deleteAction} className="contents">
                  <input type="hidden" name="profileId" value={profile.id} />
                  <DialogFooter showCloseButton={false}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDeleteDialogOpen(false)}
                      disabled={isDeletePending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="destructive" disabled={isDeletePending}>
                      {isDeletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      <div data-profile-id={profile.id}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${profile.id}`}>Name</Label>
            <Input
              id={`name-${profile.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`birth-${profile.id}`}>Birth Year</Label>
            <Input
              id={`birth-${profile.id}`}
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              value={birthYear}
              onChange={(e) => setBirthYear(Number(e.target.value) || 1990)}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`marital-${profile.id}`}>Marital Status</Label>
            <Select
              value={maritalStatus || "none"}
              onValueChange={(v) => setMaritalStatus(v === "none" ? "" : v)}
            >
              <SelectTrigger id={`marital-${profile.id}`} className="h-8">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married">Married</SelectItem>
                <SelectItem value="divorced">Divorced</SelectItem>
                <SelectItem value="widowed">Widowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`dependents-${profile.id}`}>Dependents</Label>
            <Input
              id={`dependents-${profile.id}`}
              type="number"
              min={0}
              max={20}
              value={numDependents}
              onChange={(e) => setNumDependents(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`salary-${profile.id}`}>Annual Salary</Label>
            <CurrencyInput
              id={`salary-${profile.id}`}
              value={annualSalary}
              onChange={(v) => setAnnualSalary(v ?? 0)}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`bonus-${profile.id}`}>Bonus Estimate</Label>
            <CurrencyInput
              id={`bonus-${profile.id}`}
              value={bonusEstimate}
              onChange={(v) => setBonusEstimate(v ?? 0)}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`freq-${profile.id}`}>Pay Frequency</Label>
            <Select
              value={payFrequency}
              onValueChange={(v) => setPayFrequency(v as "monthly" | "bi-monthly" | "weekly")}
            >
              <SelectTrigger id={`freq-${profile.id}`} className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="bi-monthly">Bi-Monthly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`cpf-${profile.id}`}>Employee CPF %</Label>
            <Input
              id={`cpf-${profile.id}`}
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={employeeCpfRate}
              onChange={(e) => setEmployeeCpfRate(e.target.value)}
              placeholder="Default"
              className="h-8"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Switch
            id={`dps-${profile.id}`}
            checked={dpsInclude}
            onCheckedChange={setDpsInclude}
          />
          <Label htmlFor={`dps-${profile.id}`} className="font-normal cursor-pointer">
            Include DPS in CPF projection
          </Label>
          <InfoTooltip id="CPF_DPS" />
        </div>
      </div>
    </>
  )
}

function TelegramSection({ profile }: { profile: ProfileWithIncome }) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(profile.telegram_link_token ?? null)
  const [generating, setGenerating] = useState(false)

  // Update local token when profile updates from server
  useEffect(() => {
    setToken(profile.telegram_link_token ?? null)
  }, [profile.telegram_link_token])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch("/api/telegram/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id }),
      })
      if (!res.ok) throw new Error("Failed to generate token")
      const data = await res.json()
      setToken(data.token)
      toast.success("Link token generated")
      router.refresh()
    } catch {
      toast.error("Failed to generate token")
    } finally {
      setGenerating(false)
    }
  }

  const isConnected = !!profile.telegram_user_id
  const lastUsed = profile.telegram_last_used ? new Date(profile.telegram_last_used).toLocaleDateString() : "Never"

  return (
    <>
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Status: {isConnected ? "Connected" : "Not Connected"}</p>
            {isConnected && <p className="text-xs text-muted-foreground mt-1">Last used: {lastUsed}</p>}
          </div>
          <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {token ? "Regenerate Token" : "Generate Link Token"}
          </Button>
        </div>
        
        {token && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-mono text-xs break-all selectable">{token}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Send <code className="bg-background px-1 rounded border">/link</code> to the Telegram bot, then paste this token when asked.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

function BanksSection({
  banks,
  profileId,
  familyId,
  primaryBankAccountId,
  onMutate,
}: {
  banks: FinancialDataByFamily["bankAccounts"]
  profileId: string
  familyId: string
  primaryBankAccountId: string | null
  onMutate: () => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newBank, setNewBank] = useState({
    bank_name: "",
    account_type: "savings" as const,
    opening_balance: 0,
    interest_rate_pct: 0,
    locked_amount: 0,
  })

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/bank-accounts/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Bank account deleted")
      onMutate()
      router.refresh()
    } catch {
      toast.error("Failed to delete")
    }
  }

  async function handleAdd() {
    if (!newBank.bank_name.trim()) {
      toast.error("Bank name is required")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: newBank.bank_name,
          accountType: newBank.account_type,
          profileId,
          familyId,
          openingBalance: newBank.opening_balance,
          interestRatePct: newBank.interest_rate_pct || undefined,
          lockedAmount: newBank.locked_amount || 0,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to add")
      }
      toast.success("Bank account added")
      setNewBank({ bank_name: "", account_type: "savings", opening_balance: 0, interest_rate_pct: 0, locked_amount: 0 })
      setAddOpen(false)
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add")
    } finally {
      setAdding(false)
    }
  }

  const [editing, setEditing] = useState<Record<string, typeof banks[0]>>({})
  useEffect(() => {
    const map: Record<string, (typeof banks)[0]> = {}
    for (const b of banks) {
      map[b.id] = { ...b }
    }
    setEditing(map)
  }, [banks])

  const banksDirty = useMemo(
    () => banks.some((b) => bankRowDirty(editing[b.id] ?? b, b)),
    [banks, editing]
  )

  const persistBanks = useCallback(async () => {
    for (const b of banks) {
      const e = editing[b.id] ?? b
      if (!bankRowDirty(e, b)) continue
      const res = await fetch(`/api/bank-accounts/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: e.bank_name,
          accountType: e.account_type,
          profileId: e.profile_id,
          openingBalance: e.opening_balance,
          interestRatePct: e.interest_rate_pct ?? 0,
          lockedAmount: e.locked_amount ?? 0,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to save bank")
      }
    }
  }, [banks, editing])

  useUserSettingsSaveRegistration(`user-settings-banks-${profileId}`, banksDirty, persistBanks)

  const addBankDialog = (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
          <DialogDescription>Add a new bank account for this profile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bank name</Label>
            <Input
              placeholder="Bank name"
              value={newBank.bank_name}
              onChange={(e) => setNewBank((p) => ({ ...p, bank_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Account type</Label>
            <Select
              value={newBank.account_type}
              onValueChange={(v) => setNewBank((p) => ({ ...p, account_type: v as typeof newBank.account_type }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Opening balance</Label>
            <CurrencyInput
              placeholder="Balance"
              value={newBank.opening_balance}
              onChange={(v) => setNewBank((p) => ({ ...p, opening_balance: v ?? 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Locked amount</Label>
            <CurrencyInput
              placeholder="Locked"
              value={newBank.locked_amount}
              onChange={(v) => setNewBank((p) => ({ ...p, locked_amount: v ?? 0 }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add bank account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  async function handlePrimaryChange(accountId: string | null) {
    try {
      const res = await fetch(`/api/profiles/${profileId}/primary-account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankAccountId: accountId }),
      })
      if (!res.ok) throw new Error("Failed to update")
      toast.success("Primary account updated")
      onMutate()
    } catch {
      toast.error("Failed to update primary account")
    }
  }

  if (banks.length === 0) {
    return (
      <>
        <EmptyState noun="bank accounts" onAdd={() => setAddOpen(true)} />
        {addBankDialog}
      </>
    )
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Label className="text-muted-foreground text-xs whitespace-nowrap">Primary account</Label>
        <Select
          value={primaryBankAccountId ?? "none"}
          onValueChange={(v) => handlePrimaryChange(v === "none" ? null : v)}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="Select primary account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {banks.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.bank_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InfoTooltip id="PRIMARY_BANK_ACCOUNT" />
      </div>
      <ScrollableTableWrapper minWidth="640px">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bank - Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Balance</TableHead>
            <TableHead>Locked</TableHead>
            <TableHead>Interest %</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {banks.map((b) => {
            const e = editing[b.id] ?? b
            return (
              <TableRow key={b.id}>
                <TableCell>
                  <Input
                    value={e.bank_name}
                    onChange={(ev) =>
                      setEditing((p) => ({
                        ...p,
                        [b.id]: { ...(p[b.id] ?? b), bank_name: ev.target.value },
                      }))
                    }
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={e.account_type}
                    onValueChange={(v) =>
                      setEditing((p) => ({
                        ...p,
                        [b.id]: { ...(p[b.id] ?? b), account_type: v },
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.opening_balance}
                    onChange={(v) =>
                      setEditing((p) => ({
                        ...p,
                        [b.id]: { ...(p[b.id] ?? b), opening_balance: v ?? 0 },
                      }))
                    }
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.locked_amount}
                    onChange={(v) =>
                      setEditing((p) => ({
                        ...p,
                        [b.id]: { ...(p[b.id] ?? b), locked_amount: v ?? 0 },
                      }))
                    }
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step={0.01}
                    value={e.interest_rate_pct ?? ""}
                    onChange={(ev) =>
                      setEditing((p) => ({
                        ...p,
                        [b.id]: {
                          ...(p[b.id] ?? b),
                          interest_rate_pct: ev.target.value ? Number(ev.target.value) : null,
                        },
                      }))
                    }
                    className="h-8 w-16"
                    placeholder="—"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(b.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </ScrollableTableWrapper>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add bank account
      </Button>
      {addBankDialog}
    </>
  )
}

function SavingsGoalsSection({
  goals,
  profileId,
  familyId,
  bankAccounts,
  onMutate,
}: {
  goals: FinancialDataByFamily["savingsGoals"]
  profileId: string
  familyId: string
  bankAccounts: FinancialDataByFamily["bankAccounts"]
  onMutate: () => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newGoal, setNewGoal] = useState({
    name: "",
    target_amount: 0,
    current_amount: 0,
    monthly_auto_amount: 0,
    deadline: "" as string | null,
    category: "custom" as string,
    linked_bank_account_id: null as string | null,
  })

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Savings goal deleted")
      onMutate()
      router.refresh()
    } catch {
      toast.error("Failed to delete")
    }
  }

  async function handleAdd() {
    if (!newGoal.name.trim()) {
      toast.error("Goal name is required")
      return
    }
    if (newGoal.target_amount <= 0) {
      toast.error("Target amount must be positive")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGoal.name,
          targetAmount: newGoal.target_amount,
          currentAmount: newGoal.current_amount,
          monthlyAutoAmount: newGoal.monthly_auto_amount,
          deadline: newGoal.deadline || null,
          category: newGoal.category,
          linkedBankAccountId: newGoal.linked_bank_account_id,
          profileId,
          familyId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to add")
      }
      toast.success("Savings goal added")
      setNewGoal({
        name: "",
        target_amount: 0,
        current_amount: 0,
        monthly_auto_amount: 0,
        deadline: null,
        category: "custom",
        linked_bank_account_id: null,
      })
      setAddOpen(false)
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add")
    } finally {
      setAdding(false)
    }
  }

  const [editing, setEditing] = useState<Record<string, (typeof goals)[0]>>({})
  useEffect(() => {
    const map: Record<string, (typeof goals)[0]> = {}
    for (const g of goals) {
      map[g.id] = { ...g }
    }
    setEditing(map)
  }, [goals])

  const goalsDirty = useMemo(
    () => goals.some((g) => goalRowDirty(editing[g.id] ?? g, g)),
    [goals, editing]
  )

  const persistGoals = useCallback(async () => {
    for (const g of goals) {
      const e = editing[g.id] ?? g
      if (!goalRowDirty(e, g)) continue
      const res = await fetch(`/api/goals/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: e.name,
          targetAmount: e.target_amount,
          currentAmount: e.current_amount,
          monthlyAutoAmount: e.monthly_auto_amount,
          deadline: e.deadline,
          category: e.category,
          linkedBankAccountId: e.linked_bank_account_id,
          profileId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to save goal")
      }
    }
  }, [goals, editing, profileId])

  useUserSettingsSaveRegistration(`user-settings-goals-${profileId}`, goalsDirty, persistGoals)

  const addGoalDialog = (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add savings goal</DialogTitle>
          <DialogDescription>Create a new savings goal for this profile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Goal name</Label>
            <Input
              placeholder="Goal name"
              value={newGoal.name}
              onChange={(e) => setNewGoal((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Target amount</Label>
            <CurrencyInput
              placeholder="Target"
              value={newGoal.target_amount}
              onChange={(v) => setNewGoal((p) => ({ ...p, target_amount: v ?? 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Monthly auto amount</Label>
            <CurrencyInput
              placeholder="Monthly auto"
              value={newGoal.monthly_auto_amount}
              onChange={(v) => setNewGoal((p) => ({ ...p, monthly_auto_amount: v ?? 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={newGoal.category}
              onValueChange={(v) => setNewGoal((p) => ({ ...p, category: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Linked bank account</Label>
            <Select
              value={newGoal.linked_bank_account_id ?? "none"}
              onValueChange={(v) => setNewGoal((p) => ({ ...p, linked_bank_account_id: v === "none" ? null : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No account</SelectItem>
                {bankAccounts.map((ba) => (
                  <SelectItem key={ba.id} value={ba.id}>
                    {ba.bank_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add savings goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (goals.length === 0) {
    return (
      <>
        <EmptyState noun="savings goals" onAdd={() => setAddOpen(true)} />
        {addGoalDialog}
      </>
    )
  }

  return (
    <>
      <ScrollableTableWrapper minWidth="900px">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Goal - Name</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Current</TableHead>
            <TableHead>Monthly Auto</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Linked Account</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {goals.map((g) => {
            const e = editing[g.id] ?? g
            return (
              <TableRow key={g.id}>
                <TableCell>
                  <Input
                    value={e.name}
                    onChange={(ev) =>
                      setEditing((p) => ({ ...p, [g.id]: { ...(p[g.id] ?? g), name: ev.target.value } }))
                    }
                    className="h-8 w-36"
                  />
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.target_amount}
                    onChange={(v) =>
                      setEditing((p) => ({ ...p, [g.id]: { ...(p[g.id] ?? g), target_amount: v ?? 0 } }))
                    }
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.current_amount}
                    onChange={(v) =>
                      setEditing((p) => ({ ...p, [g.id]: { ...(p[g.id] ?? g), current_amount: v ?? 0 } }))
                    }
                    className="h-8 w-24"
                    disabled={!!e.linked_bank_account_id}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <CurrencyInput
                      value={e.monthly_auto_amount}
                      onChange={(v) =>
                        setEditing((p) => ({ ...p, [g.id]: { ...(p[g.id] ?? g), monthly_auto_amount: v ?? 0 } }))
                      }
                      className="h-8 w-24"
                    />
                    {e.deadline && e.target_amount > e.current_amount && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-1.5 text-xs text-muted-foreground"
                        title="Auto-calculate from target, current & deadline"
                        onClick={() => {
                          const auto = calculateMonthlyAuto(e.target_amount, e.current_amount, e.deadline)
                          if (auto != null) {
                            setEditing((p) => ({
                              ...p,
                              [g.id]: { ...(p[g.id] ?? g), monthly_auto_amount: Math.round(auto * 100) / 100 },
                            }))
                          }
                        }}
                      >
                        Auto
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <DatePicker
                    value={e.deadline ?? null}
                    onChange={(d) =>
                      setEditing((p) => ({
                        ...p,
                        [g.id]: { ...(p[g.id] ?? g), deadline: d },
                      }))
                    }
                    placeholder="Deadline"
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={e.category}
                    onValueChange={(v) =>
                      setEditing((p) => ({ ...p, [g.id]: { ...(p[g.id] ?? g), category: v } }))
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOAL_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={e.linked_bank_account_id ?? "none"}
                    onValueChange={(v) =>
                      setEditing((p) => ({
                        ...p,
                        [g.id]: { ...(p[g.id] ?? g), linked_bank_account_id: v === "none" ? null : v },
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {bankAccounts.map((ba) => (
                        <SelectItem key={ba.id} value={ba.id}>
                          {ba.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </ScrollableTableWrapper>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add savings goal
      </Button>
      {addGoalDialog}
    </>
  )
}

function CPFSection({
  profileId,
  cpfData,
  familyId,
}: {
  profileId: string
  cpfData: FinancialDataByFamily["cpfBalances"][0] | undefined
  familyId: string
}) {
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
  const [oa, setOa] = useState(cpfData?.oa ?? 0)
  const [sa, setSa] = useState(cpfData?.sa ?? 0)
  const [ma, setMa] = useState(cpfData?.ma ?? 0)

  useEffect(() => {
    setOa(cpfData?.oa ?? 0)
    setSa(cpfData?.sa ?? 0)
    setMa(cpfData?.ma ?? 0)
  }, [cpfData])

  const cpfDirty =
    oa !== (cpfData?.oa ?? 0) || sa !== (cpfData?.sa ?? 0) || ma !== (cpfData?.ma ?? 0)

  const persistCpf = useCallback(async () => {
    const res = await fetch("/api/cpf/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        familyId,
        month: currentMonth,
        oa,
        sa,
        ma,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error ?? "Failed to save CPF")
    }
  }, [profileId, familyId, currentMonth, oa, sa, ma])

  useUserSettingsSaveRegistration(`user-settings-cpf-${profileId}`, cpfDirty, persistCpf)

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`cpf-oa-${profileId}`}>Ordinary Account (OA)</Label>
          <CurrencyInput
            id={`cpf-oa-${profileId}`}
            value={oa}
            onChange={(v) => setOa(v ?? 0)}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`cpf-sa-${profileId}`}>Special Account (SA)</Label>
          <CurrencyInput
            id={`cpf-sa-${profileId}`}
            value={sa}
            onChange={(v) => setSa(v ?? 0)}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`cpf-ma-${profileId}`}>Medisave Account (MA)</Label>
          <CurrencyInput
            id={`cpf-ma-${profileId}`}
            value={ma}
            onChange={(v) => setMa(v ?? 0)}
            className="h-8"
          />
        </div>
      </div>
    </>
  )
}

function MonthlyLogSection({
  profileId,
  profileName,
  logs,
  familyId,
  onMutate,
}: {
  profileId: string
  profileName: string
  logs: FinancialDataByFamily["monthlyCashflow"]
  familyId: string
  onMutate: () => void
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const [month, setMonth] = useState(defaultMonth)
  const [inflow, setInflow] = useState(0)
  const [outflow, setOutflow] = useState(0)
  const [logBaseline, setLogBaseline] = useState<{
    month: string
    inflow: number
    outflow: number
  } | null>(null)
  const [entryToDelete, setEntryToDelete] = useState<
    FinancialDataByFamily["monthlyCashflow"][0] | null
  >(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { aggregateDirty, saveAll, isSaving } = useUserSettingsSave()

  const profileLogs = logs.filter((l) => l.profile_id === profileId)

  const normalizeMonthKey = (m: string) => m.slice(0, 10)

  const applyMonthSelection = useCallback(
    (nextMonth: string) => {
      const key = normalizeMonthKey(nextMonth)
      const entry = profileLogs.find((l) => normalizeMonthKey(l.month) === key)
      const inf = entry ? Number(entry.inflow ?? 0) : 0
      const outf = entry ? Number(entry.outflow ?? 0) : 0
      setMonth(nextMonth)
      setInflow(inf)
      setOutflow(outf)
      setLogBaseline({ month: nextMonth, inflow: inf, outflow: outf })
    },
    [profileLogs]
  )

  const prevDrawerOpen = useRef(false)
  useLayoutEffect(() => {
    if (drawerOpen && !prevDrawerOpen.current) {
      applyMonthSelection(defaultMonth)
    }
    prevDrawerOpen.current = drawerOpen
  }, [drawerOpen, defaultMonth, applyMonthSelection])

  const effectiveBaseline =
    logBaseline ?? (drawerOpen ? { month: defaultMonth, inflow: 0, outflow: 0 } : null)

  const logFormDirty =
    drawerOpen &&
    effectiveBaseline != null &&
    (normalizeMonthKey(month) !== normalizeMonthKey(effectiveBaseline.month) ||
      inflow !== effectiveBaseline.inflow ||
      outflow !== effectiveBaseline.outflow)

  const persistMonthlyLog = useCallback(async () => {
    const res = await fetch("/api/cashflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        familyId,
        month,
        inflow,
        outflow,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error ?? "Failed to save cashflow")
    }
    setInflow(0)
    setOutflow(0)
    setMonth(defaultMonth)
    setLogBaseline({ month: defaultMonth, inflow: 0, outflow: 0 })
    onMutate()
  }, [profileId, familyId, month, inflow, outflow, defaultMonth, onMutate])

  useUserSettingsSaveRegistration(`user-settings-cashflow-${profileId}`, logFormDirty, persistMonthlyLog)

  function formatMonth(m: string) {
    const [y, mo] = m.slice(0, 10).split("-")
    const d = new Date(Number(y), Number(mo) - 1, 1)
    return d.toLocaleDateString("en-SG", { year: "numeric", month: "short" })
  }

  async function confirmDeleteMonthlyEntry() {
    if (!entryToDelete) return
    setDeletingId(entryToDelete.id)
    try {
      const res = await fetch("/api/cashflow", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryToDelete.id, familyId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to delete entry")
      }
      toast.success("Monthly entry removed")
      if (normalizeMonthKey(entryToDelete.month) === normalizeMonthKey(month)) {
        setInflow(0)
        setOutflow(0)
        setLogBaseline({ month, inflow: 0, outflow: 0 })
      }
      setEntryToDelete(null)
      onMutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
          <FileText className="h-4 w-4" />
          Log
        </Button>
        {profileLogs.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {profileLogs.length} logged
          </span>
        )}
      </div>

      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) {
            setLogBaseline(null)
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-[50vw]"
        >
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4">
            <SheetTitle>Log inflow & outflow</SheetTitle>
            <SheetDescription>
              Record total inflow (income + bonus - CPF) and total outflow (inclusive of tax, insurance, ILP, loans) for {profileName}.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-4">
            <div className="space-y-2">
              <Label htmlFor="log-month">Month</Label>
              <MonthYearPicker
                id="log-month"
                value={month}
                onChange={(d) => {
                  applyMonthSelection(d ?? defaultMonth)
                }}
                placeholder="Select month"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="log-inflow">Inflow (income + bonus - CPF)</Label>
                <CurrencyInput
                  id="log-inflow"
                  value={inflow}
                  onChange={(v) => setInflow(v ?? 0)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-outflow">Outflow (total, incl. tax, insurance, loans)</Label>
                <CurrencyInput
                  id="log-outflow"
                  value={outflow}
                  onChange={(v) => setOutflow(v ?? 0)}
                  className="w-full"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Logged entries</h4>
              {profileLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No entries yet.</p>
              ) : (
                <ScrollArea className="h-[280px] rounded-lg border">
                  <div className="space-y-1 p-2">
                    {profileLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <span className="min-w-0 flex-1 font-medium">{formatMonth(entry.month)}</span>
                        <span className="shrink-0 text-right text-muted-foreground">
                          In: ${Number(entry.inflow ?? 0).toLocaleString()} · Out: ${Number(entry.outflow ?? 0).toLocaleString()}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={deletingId === entry.id}
                          aria-label={`Delete ${formatMonth(entry.month)} entry`}
                          onClick={() => setEntryToDelete(entry)}
                        >
                          {deletingId === entry.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t bg-background px-6 py-4">
            <Button
              type="button"
              size="sm"
              disabled={isSaving || (!logFormDirty && !aggregateDirty)}
              onClick={() => void saveAll()}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={entryToDelete != null}
        onOpenChange={(open) => {
          if (!open) setEntryToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete monthly entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {entryToDelete
                ? `Remove ${formatMonth(entryToDelete.month)} cashflow for ${profileName}. Dashboard and bank balance use this data.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId != null}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletingId != null}
              onClick={() => void confirmDeleteMonthlyEntry()}
            >
              {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function InvestmentCashBalanceSettings({
  profileId,
  familyId,
  onMutate,
}: {
  profileId: string
  familyId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const [cashUsd, setCashUsd] = useState<number | null>(null)
  const [initialCashSgd, setInitialCashSgd] = useState(0)
  const [sgdPerUsd, setSgdPerUsd] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("profileId", profileId)
        params.set("familyId", familyId)
        const [accRes, fxRes] = await Promise.all([
          fetch(`/api/investments/account?${params}`),
          fetch("/api/fx/usd-sgd"),
        ])
        const fxJson = fxRes.ok ? await fxRes.json() : { sgdPerUsd: null }
        const rate = fxJson.sgdPerUsd as number | null
        if (!cancelled) setSgdPerUsd(rate)

        if (accRes.ok) {
          const acc = await accRes.json()
          const sgd = Number(acc.cashBalance ?? 0)
          if (!cancelled) {
            setInitialCashSgd(sgd)
            if (rate != null && rate > 0) {
              setCashUsd(Math.round((sgd / rate) * 100) / 100)
            } else {
              setCashUsd(0)
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [profileId, familyId])

  const dirty = useMemo(() => {
    if (loading || sgdPerUsd == null || sgdPerUsd <= 0) return false
    const nextSgd = Math.round((cashUsd ?? 0) * sgdPerUsd * 100) / 100
    return Math.abs(nextSgd - initialCashSgd) > 0.005
  }, [cashUsd, initialCashSgd, sgdPerUsd, loading])

  const persistCash = useCallback(async () => {
    if (sgdPerUsd == null || sgdPerUsd <= 0) {
      throw new Error("USD/SGD rate unavailable. Try again later.")
    }
    const cashSgd = Math.round((cashUsd ?? 0) * sgdPerUsd * 100) / 100
    const res = await fetch("/api/investments/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cashBalance: cashSgd,
        profileId,
        familyId,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error ?? "Failed to save cash balance")
    }
    setInitialCashSgd(cashSgd)
    onMutate()
    router.refresh()
  }, [cashUsd, sgdPerUsd, profileId, familyId, onMutate, router])

  useUserSettingsSaveRegistration(
    `user-settings-investment-cash-${profileId}`,
    dirty,
    persistCash,
  )

  const sgdEquivalent =
    sgdPerUsd != null &&
    sgdPerUsd > 0 &&
    cashUsd != null &&
    Number.isFinite(cashUsd)
      ? Math.round(cashUsd * sgdPerUsd * 100) / 100
      : null

  return (
    <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="max-w-md space-y-1">
        <Label htmlFor={`investment-cash-usd-${profileId}`}>Cash balance (USD)</Label>
        <p className="text-xs text-muted-foreground">
          Stored in SGD for net-worth and investment totals. Enter your brokerage cash in USD;
          we convert using a live USD/SGD rate.
        </p>
        {loading ? (
          <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
        ) : (
          <CurrencyInput
            id={`investment-cash-usd-${profileId}`}
            placeholder="0.00"
            value={cashUsd}
            onChange={(v) => setCashUsd(v)}
            allowNegativeValue
            className="h-8 w-40"
            disabled={sgdPerUsd == null || sgdPerUsd <= 0}
          />
        )}
        {sgdEquivalent != null ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            ≈ ${formatCurrency(sgdEquivalent)} SGD stored
          </p>
        ) : null}
        {sgdPerUsd == null && !loading ? (
          <p className="text-xs text-destructive">Could not load USD/SGD rate.</p>
        ) : null}
      </div>
    </div>
  )
}

function InvestmentsSection({
  investments,
  profileId,
  familyId,
  onMutate,
}: {
  investments: FinancialDataByFamily["investments"]
  profileId: string
  familyId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newInv, setNewInv] = useState<{
    symbol: string
    type: InvestmentKind
    cost_basis: number
  }>({
    symbol: "",
    type: "stock",
    cost_basis: 0,
  })
  const [newUnitsInput, setNewUnitsInput] = useState("")

  const isGoldOrSilver = (t: string) => t === "gold" || t === "silver"
  const needsSymbolPicker = (t: string) => !isGoldOrSilver(t) && t !== "ilp"

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/investments/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Investment deleted")
      onMutate()
      router.refresh()
    } catch {
      toast.error("Failed to delete")
    }
  }

  async function handleAdd() {
    const symbolToSave = isGoldOrSilver(newInv.type)
      ? newInv.type === "gold"
        ? "Gold"
        : "Silver"
      : newInv.symbol.trim()
    if (!symbolToSave) {
      toast.error(newInv.type === "ilp" ? "Policy name is required" : "Symbol is required")
      return
    }
    const unitsNum = Number.parseFloat(newUnitsInput)
    if (Number.isNaN(unitsNum) || unitsNum < 0) {
      toast.error("Please enter valid units.")
      return
    }

    setAdding(true)
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbolToSave,
          type: newInv.type,
          units: unitsNum,
          costBasis: newInv.cost_basis,
          profileId,
          familyId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to add")
      }
      toast.success("Investment added")
      setNewInv({ symbol: "", type: "stock", cost_basis: 0 })
      setNewUnitsInput("")
      setAddOpen(false)
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add")
    } finally {
      setAdding(false)
    }
  }

  const [symbolDrawerOpen, setSymbolDrawerOpen] = useState(false)
  const [symbolDrawerEditId, setSymbolDrawerEditId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, (typeof investments)[0]>>({})
  useEffect(() => {
    const map: Record<string, (typeof investments)[0]> = {}
    for (const i of investments) {
      map[i.id] = { ...i }
    }
    setEditing(map)
  }, [investments])

  const investmentsDirty = useMemo(
    () => investments.some((inv) => invRowDirty(editing[inv.id] ?? inv, inv)),
    [investments, editing]
  )

  const persistInvestments = useCallback(async () => {
    for (const inv of investments) {
      const e = editing[inv.id] ?? inv
      if (!invRowDirty(e, inv)) continue
      const res = await fetch(`/api/investments/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: e.symbol,
          type: e.type,
          units: e.units,
          costBasis: e.cost_basis,
          targetAllocationPct: e.target_allocation_pct,
          profileId: e.profile_id,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to save investment")
      }
    }
  }, [investments, editing])

  useUserSettingsSaveRegistration(
    `user-settings-investments-${profileId}`,
    investmentsDirty,
    persistInvestments
  )

  const effectiveNewSymbol = isGoldOrSilver(newInv.type)
    ? newInv.type === "gold"
      ? "Gold"
      : "Silver"
    : newInv.symbol

  function onNewInvestmentTypeChange(nextType: InvestmentKind) {
    setNewInv((p) => {
      let symbol = p.symbol
      if (
        (p.type === "ilp" && needsSymbolPicker(nextType)) ||
        (needsSymbolPicker(p.type) && nextType === "ilp")
      ) {
        symbol = ""
      } else if (isGoldOrSilver(nextType)) {
        symbol = nextType === "gold" ? "Gold" : "Silver"
      } else if (isGoldOrSilver(p.type) && needsSymbolPicker(nextType)) {
        symbol = ""
      }
      return { ...p, type: nextType, symbol }
    })
  }

  const addInvestmentDialog = (
    <>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add investment</DialogTitle>
            <DialogDescription>Add a new investment holding for this profile.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newInv.type}
                onValueChange={(v) => onNewInvestmentTypeChange(v as InvestmentKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVESTMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{newInv.type === "ilp" ? "Policy name" : "Symbol"}</Label>
              {isGoldOrSilver(newInv.type) ? (
                <Input value={effectiveNewSymbol} disabled className="bg-muted" />
              ) : newInv.type === "ilp" ? (
                <Input
                  placeholder="e.g. Prudential ILP"
                  value={newInv.symbol}
                  onChange={(e) => setNewInv((p) => ({ ...p, symbol: e.target.value }))}
                />
              ) : effectiveNewSymbol ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 items-center gap-1 rounded-md border bg-muted px-3 text-sm font-medium">
                    {effectiveNewSymbol}
                    <button
                      type="button"
                      onClick={() => setNewInv((p) => ({ ...p, symbol: "" }))}
                      className="rounded p-0.5 hover:bg-muted-foreground/20"
                      aria-label="Clear symbol"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setSymbolDrawerOpen(true)}>
                    Change
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setSymbolDrawerOpen(true)}>
                  <Plus className="mr-2 size-3.5" />
                  Search symbol
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label>Units</Label>
              <Input
                type="number"
                step="any"
                min={0}
                placeholder="0"
                value={newUnitsInput}
                onChange={(ev) => setNewUnitsInput(ev.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cost per unit</Label>
              <CurrencyInput
                placeholder="Avg. price per unit"
              value={newInv.cost_basis}
              onChange={(v) => setNewInv((p) => ({ ...p, cost_basis: v ?? 0 }))}
            />
          </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAdd} disabled={adding || !effectiveNewSymbol.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add investment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SymbolPickerDrawer
        open={symbolDrawerOpen}
        onOpenChange={setSymbolDrawerOpen}
        onSelect={(s) => {
          setNewInv((p) => ({ ...p, symbol: s }))
          setSymbolDrawerOpen(false)
        }}
      />
    </>
  )

  if (investments.length === 0) {
    return (
      <>
        <InvestmentCashBalanceSettings
          profileId={profileId}
          familyId={familyId}
          onMutate={onMutate}
        />
        <EmptyState noun="investments" onAdd={() => setAddOpen(true)} />
        {addInvestmentDialog}
      </>
    )
  }

  return (
    <>
      <InvestmentCashBalanceSettings
        profileId={profileId}
        familyId={familyId}
        onMutate={onMutate}
      />
      <ScrollableTableWrapper minWidth="700px">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol / Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Units</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Cost per unit
                <InfoTooltip id="INVESTMENT_COST_PER_UNIT" />
              </span>
            </TableHead>
            <TableHead>Target %</TableHead>
            <TableHead className="tabular-nums">Current price (US$)</TableHead>
            <TableHead className="tabular-nums">Current value (US$)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {investments.map((inv) => {
            const e = editing[inv.id] ?? inv
            const isMetal = isGoldOrSilver(e.type)
            return (
              <TableRow key={inv.id}>
                <TableCell>
                  {isMetal ? (
                    <Input value={e.symbol} disabled className="h-8 w-24 bg-muted" />
                  ) : e.type === "ilp" ? (
                    <Input
                      value={e.symbol}
                      onChange={(ev) =>
                        setEditing((prev) => ({
                          ...prev,
                          [inv.id]: { ...(prev[inv.id] ?? inv), symbol: ev.target.value },
                        }))
                      }
                      placeholder="e.g. Prudential ILP"
                      className="h-8 w-32"
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="inline-flex h-8 min-w-[4rem] items-center gap-1 rounded-md border bg-muted px-2 text-sm font-medium">
                        {e.symbol}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-1"
                        onClick={() => setSymbolDrawerEditId(inv.id)}
                      >
                        Change
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={e.type}
                    onValueChange={(v) => {
                      setEditing((p) => {
                        const cur = p[inv.id] ?? inv
                        let symbol = cur.symbol
                        if (
                          (cur.type === "ilp" && needsSymbolPicker(v)) ||
                          (needsSymbolPicker(cur.type) && v === "ilp")
                        ) {
                          symbol = ""
                        } else if (isGoldOrSilver(v)) {
                          symbol = v === "gold" ? "Gold" : "Silver"
                        } else if (isGoldOrSilver(cur.type) && needsSymbolPicker(v)) {
                          symbol = ""
                        }
                        return { ...p, [inv.id]: { ...cur, type: v, symbol } }
                      })
                      if (symbolDrawerEditId === inv.id && v === "ilp") {
                        setSymbolDrawerEditId(null)
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVESTMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={e.units}
                    onChange={(ev) => {
                      const raw = ev.target.value
                      const n = raw === "" ? 0 : Number.parseFloat(raw)
                      setEditing((p) => ({
                        ...p,
                        [inv.id]: {
                          ...(p[inv.id] ?? inv),
                          units: Number.isFinite(n) && n >= 0 ? n : 0,
                        },
                      }))
                    }}
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.cost_basis}
                    onChange={(v) =>
                      setEditing((p) => ({ ...p, [inv.id]: { ...(p[inv.id] ?? inv), cost_basis: v ?? 0 } }))
                    }
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={e.target_allocation_pct ?? ""}
                    placeholder="—"
                    onChange={(ev) => {
                      const raw = ev.target.value
                      const n = raw === "" ? null : Number.parseFloat(raw)
                      setEditing((p) => ({
                        ...p,
                        [inv.id]: {
                          ...(p[inv.id] ?? inv),
                          target_allocation_pct:
                            n != null && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null,
                        },
                      }))
                    }}
                    className="h-8 w-16"
                  />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {inv.current_price != null &&
                  Number.isFinite(inv.current_price) &&
                  inv.current_price > 0
                    ? `US$${formatCurrency(inv.current_price)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {inv.current_price != null &&
                  Number.isFinite(inv.current_price) &&
                  inv.current_price > 0
                    ? `US$${formatCurrency(e.units * inv.current_price)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(inv.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </ScrollableTableWrapper>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add investment
      </Button>
      {addInvestmentDialog}
      <SymbolPickerDrawer
        open={symbolDrawerEditId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSymbolDrawerEditId(null)
          }
        }}
        onSelect={(s) => {
          if (symbolDrawerEditId) {
            setEditing((p) => {
              const inv = investments.find((i) => i.id === symbolDrawerEditId)
              if (!inv) return p
              return { ...p, [symbolDrawerEditId]: { ...(p[symbolDrawerEditId] ?? inv), symbol: s } }
            })
            setSymbolDrawerEditId(null)
          }
        }}
      />
    </>
  )
}

function LoansSection({
  loans,
  profileId,
  onMutate,
}: {
  loans: FinancialDataByFamily["loans"]
  profileId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newLoan, setNewLoan] = useState({
    name: "",
    type: "housing" as const,
    principal: 0,
    rate_pct: 0,
    tenure_months: 0,
    start_date: new Date().toISOString().slice(0, 10),
    lender: "",
    use_cpf_oa: false,
    valuation_limit: null as number | null,
  })

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/loans/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Loan deleted")
      onMutate()
      router.refresh()
    } catch {
      toast.error("Failed to delete")
    }
  }

  async function handleAdd() {
    if (!newLoan.name.trim()) {
      toast.error("Loan name is required")
      return
    }
    if (newLoan.principal <= 0) {
      toast.error("Principal must be positive")
      return
    }
    if (newLoan.tenure_months <= 0) {
      toast.error("Tenure must be at least 1 month")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          name: newLoan.name,
          type: newLoan.type,
          principal: newLoan.principal,
          ratePct: newLoan.rate_pct,
          tenureMonths: newLoan.tenure_months,
          startDate: newLoan.start_date,
          lender: newLoan.lender || undefined,
          useCpfOa: newLoan.use_cpf_oa,
          valuationLimit: newLoan.valuation_limit,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to add")
      }
      toast.success("Loan added")
      setNewLoan({
        name: "",
        type: "housing",
        principal: 0,
        rate_pct: 0,
        tenure_months: 0,
        start_date: new Date().toISOString().slice(0, 10),
        lender: "",
        use_cpf_oa: false,
        valuation_limit: null,
      })
      setAddOpen(false)
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add")
    } finally {
      setAdding(false)
    }
  }

  const [editing, setEditing] = useState<Record<string, (typeof loans)[0]>>({})
  useEffect(() => {
    const map: Record<string, (typeof loans)[0]> = {}
    for (const l of loans) {
      map[l.id] = {
        ...l,
        valuation_limit: l.valuation_limit ?? null,
        use_cpf_oa: l.use_cpf_oa ?? false,
      }
    }
    setEditing(map)
  }, [loans])

  const loansDirty = useMemo(
    () => loans.some((l) => loanRowDirty(editing[l.id] ?? l, l)),
    [loans, editing]
  )

  const persistLoans = useCallback(async () => {
    for (const l of loans) {
      const e = editing[l.id] ?? l
      if (!loanRowDirty(e, l)) continue
      const res = await fetch(`/api/loans/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: e.name,
          type: e.type,
          principal: e.principal,
          ratePct: e.rate_pct,
          tenureMonths: e.tenure_months,
          startDate: e.start_date,
          lender: e.lender,
          useCpfOa: e.use_cpf_oa,
          valuationLimit: e.valuation_limit,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to save loan")
      }
    }
  }, [loans, editing])

  useUserSettingsSaveRegistration(`user-settings-loans-${profileId}`, loansDirty, persistLoans)

  const addLoanDialog = (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add loan</DialogTitle>
          <DialogDescription>Add a new loan for this profile.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Loan name</Label>
            <Input
              placeholder="Loan name"
              value={newLoan.name}
              onChange={(e) => setNewLoan((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={newLoan.type}
              onValueChange={(v) => setNewLoan((p) => ({ ...p, type: v as typeof newLoan.type }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOAN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Principal</Label>
            <CurrencyInput
              placeholder="Principal"
              value={newLoan.principal}
              onChange={(v) => setNewLoan((p) => ({ ...p, principal: v ?? 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Interest rate %</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              placeholder="0"
              value={newLoan.rate_pct || ""}
              onChange={(e) =>
                setNewLoan((p) => ({ ...p, rate_pct: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Tenure (months)</Label>
            <Input
              type="number"
              min={1}
              placeholder="Months"
              value={newLoan.tenure_months || ""}
              onChange={(e) =>
                setNewLoan((p) => ({ ...p, tenure_months: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Start date</Label>
            <DatePicker
              value={newLoan.start_date || null}
              onChange={(d) => setNewLoan((p) => ({ ...p, start_date: d ?? "" }))}
              placeholder="Start date"
            />
          </div>
          <div className="space-y-2">
            <Label>Valuation limit (120% cap)</Label>
            <CurrencyInput
              placeholder="Optional"
              value={newLoan.valuation_limit ?? undefined}
              onChange={(v) => setNewLoan((p) => ({ ...p, valuation_limit: v ?? null }))}
            />
          </div>
          <div className="flex items-center gap-2 pt-7">
            <input
              id="new-loan-cpf-dialog"
              type="checkbox"
              className="h-4 w-4 rounded border border-input"
              checked={newLoan.use_cpf_oa}
              onChange={(ev) =>
                setNewLoan((p) => ({ ...p, use_cpf_oa: ev.target.checked }))
              }
            />
            <Label htmlFor="new-loan-cpf-dialog" className="font-normal cursor-pointer">
              Uses CPF OA
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add loan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (loans.length === 0) {
    return (
      <>
        <EmptyState noun="loans" onAdd={() => setAddOpen(true)} />
        {addLoanDialog}
      </>
    )
  }

  return (
    <>
      <ScrollableTableWrapper minWidth="800px">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Loan - Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Rate %</TableHead>
            <TableHead>Tenure (mo)</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead className="text-center">CPF OA</TableHead>
            <TableHead>VL (est.)</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loans.map((l) => {
            const e = editing[l.id] ?? l
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <Input
                    value={e.name}
                    onChange={(ev) =>
                      setEditing((p) => ({ ...p, [l.id]: { ...(p[l.id] ?? l), name: ev.target.value } }))
                    }
                    className="h-8 w-28"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={e.type}
                    onValueChange={(v) =>
                      setEditing((p) => ({ ...p, [l.id]: { ...(p[l.id] ?? l), type: v } }))
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOAN_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.principal}
                    onChange={(v) =>
                      setEditing((p) => ({ ...p, [l.id]: { ...(p[l.id] ?? l), principal: v ?? 0 } }))
                    }
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step={0.01}
                    value={e.rate_pct}
                    onChange={(ev) =>
                      setEditing((p) => ({
                        ...p,
                        [l.id]: { ...(p[l.id] ?? l), rate_pct: Number(ev.target.value) || 0 },
                      }))
                    }
                    className="h-8 w-16"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={e.tenure_months}
                    onChange={(ev) =>
                      setEditing((p) => ({
                        ...p,
                        [l.id]: { ...(p[l.id] ?? l), tenure_months: Number(ev.target.value) || 0 },
                      }))
                    }
                    className="h-8 w-20"
                  />
                </TableCell>
                <TableCell>
                  <DatePicker
                    value={e.start_date || null}
                    onChange={(d) =>
                      setEditing((p) => ({ ...p, [l.id]: { ...(p[l.id] ?? l), start_date: d ?? "" } }))
                    }
                    placeholder="Start date"
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border border-input"
                    checked={e.use_cpf_oa}
                    onChange={(ev) =>
                      setEditing((p) => ({
                        ...p,
                        [l.id]: { ...(p[l.id] ?? l), use_cpf_oa: ev.target.checked },
                      }))
                    }
                    aria-label="Uses CPF OA for housing"
                  />
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.valuation_limit ?? undefined}
                    onChange={(v) =>
                      setEditing((p) => ({
                        ...p,
                        [l.id]: { ...(p[l.id] ?? l), valuation_limit: v ?? null },
                      }))
                    }
                    className="h-8 w-24"
                    placeholder="VL"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(l.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </ScrollableTableWrapper>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add loan
      </Button>
      {addLoanDialog}
    </>
  )
}

type RepaymentApiRow = {
  id: string
  loan_id: string
  amount: number
  date: string
  principal_portion: number | null
  interest_portion: number | null
  cpf_oa_amount: number | null
}

function LoanRepaymentsSection({
  loans,
  profileId,
  onMutate,
}: {
  loans: FinancialDataByFamily["loans"]
  profileId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const loanNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of loans) m.set(l.id, l.name)
    return m
  }, [loans])

  const [rows, setRows] = useState<RepaymentApiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({
    loanId: "",
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    cpfOaAmount: null as number | null,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/loans/repayments?profileId=${profileId}`)
      if (!res.ok) throw new Error("Failed to load repayments")
      const data = (await res.json()) as { repayments?: RepaymentApiRow[] }
      setRows(data.repayments ?? [])
    } catch {
      toast.error("Could not load repayments")
    } finally {
      setLoading(false)
    }
  }, [profileId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loans.length === 0) return
    setForm((f) => {
      if (f.loanId && loans.some((l) => l.id === f.loanId)) return f
      return { ...f, loanId: loans[0]!.id }
    })
  }, [loans])

  async function handleSubmit() {
    if (!form.loanId) {
      toast.error("Select a loan")
      return
    }
    if (form.amount <= 0) {
      toast.error("Amount must be positive")
      return
    }
    const cpf = form.cpfOaAmount
    if (cpf != null && cpf > form.amount) {
      toast.error("CPF OA cannot exceed repayment amount")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/loans/repayments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: form.loanId,
          amount: form.amount,
          date: form.date,
          cpfOaAmount: cpf != null && cpf > 0 ? cpf : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to log repayment")
      }
      toast.success("Repayment logged")
      setForm((f) => ({
        ...f,
        amount: 0,
        cpfOaAmount: null,
      }))
      setAddOpen(false)
      await load()
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log repayment")
    } finally {
      setSubmitting(false)
    }
  }

  if (loans.length === 0) return null

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Log instalments here. If you enter a CPF OA portion and the loan uses CPF OA, a matching monthly
        housing tranche is created for the CPF dashboard.
      </p>

      <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add repayment
      </Button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log loan repayment</DialogTitle>
            <DialogDescription>Record a loan instalment payment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Loan</Label>
              <Select value={form.loanId} onValueChange={(loanId) => setForm((f) => ({ ...f, loanId }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Loan" />
                </SelectTrigger>
                <SelectContent>
                  {loans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <DatePicker
                value={form.date || null}
                onChange={(d) => setForm((f) => ({ ...f, date: d ?? "" }))}
                placeholder="Date"
              />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <CurrencyInput
                value={form.amount || undefined}
                onChange={(v) => setForm((f) => ({ ...f, amount: v ?? 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                CPF OA
                <InfoTooltip id="CPF_HOUSING_REFUND" />
              </Label>
              <CurrencyInput
                placeholder="Optional"
                value={form.cpfOaAmount ?? undefined}
                onChange={(v) => setForm((f) => ({ ...f, cpfOaAmount: v ?? null }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add repayment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-4 rounded-md border">
        <ScrollableTableWrapper minWidth="600px">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Loan</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">CPF OA</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Interest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-sm">
                  No repayments logged yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(0, 25).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{r.date}</TableCell>
                  <TableCell>{loanNameById.get(r.loan_id) ?? r.loan_id}</TableCell>
                  <TableCell className="text-right tabular-nums">${formatCurrency(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.cpf_oa_amount != null && r.cpf_oa_amount > 0
                      ? `$${formatCurrency(r.cpf_oa_amount)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.principal_portion != null ? `$${formatCurrency(r.principal_portion)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.interest_portion != null ? `$${formatCurrency(r.interest_portion)}` : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </ScrollableTableWrapper>
        {rows.length > 25 && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Showing latest 25 of {rows.length}
          </p>
        )}
      </div>
    </>
  )
}

function InsuranceSection({
  policies,
  profileId,
  onMutate,
}: {
  policies: FinancialDataByFamily["insurancePolicies"]
  profileId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  type CoverageEntry = {
    coverage_type: CoverageType | null
    coverage_amount: number | null
    benefit_name: string | null
    benefit_premium: number | null
    renewal_bonus: number | null
    benefit_expiry_date: string | null
    benefit_unit: string | null
    sort_order: number
  }

  const makeStandardCoverage = (ct: CoverageType, sortOrder: number): CoverageEntry => ({
    coverage_type: ct,
    coverage_amount: null,
    benefit_name: COVERAGE_TYPE_LABELS[ct],
    benefit_premium: null,
    renewal_bonus: null,
    benefit_expiry_date: null,
    benefit_unit: null,
    sort_order: sortOrder,
  })

  const [newPolicy, setNewPolicy] = useState<{
    name: string
    type: InsuranceType
    premium_amount: number
    frequency: "monthly" | "yearly"
    coverage_amount: number | null
    coverages: CoverageEntry[]
    customBenefits: CoverageEntry[]
    yearly_outflow_date: number | null
    current_amount: number | null
    end_date: string | null
    sub_type: string | null
    rider_name: string | null
    rider_premium: number | null
    insurer: string | null
    policy_number: string | null
    maturity_value: number | null
    cash_value: number | null
    coverage_till_age: number | null
    inception_date: string | null
    cpf_premium: number | null
    premium_waiver: boolean
    remarks: string | null
  }>({
    name: "",
    type: "term_life",
    premium_amount: 0,
    frequency: "yearly",
    coverage_amount: null,
    coverages: DEFAULT_COVERAGES_BY_POLICY.term_life.map((ct, i) => makeStandardCoverage(ct, i)),
    customBenefits: [],
    yearly_outflow_date: null,
    current_amount: null,
    end_date: null,
    sub_type: null,
    rider_name: null,
    rider_premium: null,
    insurer: null,
    policy_number: null,
    maturity_value: null,
    cash_value: null,
    coverage_till_age: null,
    inception_date: null,
    cpf_premium: null,
    premium_waiver: false,
    remarks: null,
  })

  const newPolicyFields = getFieldsForInsurancePolicyRow(newPolicy.type, newPolicy.frequency)

  function setNewPolicyType(type: InsuranceType) {
    setNewPolicy((prev) => {
      const fields = getFieldsForInsurancePolicyRow(type, prev.frequency)
      return {
        ...prev,
        type,
        coverages: DEFAULT_COVERAGES_BY_POLICY[type].map((ct, i) => makeStandardCoverage(ct, i)),
        customBenefits: prev.customBenefits,
        current_amount: fields.showCurrentAmount ? prev.current_amount : null,
        end_date: fields.showEndDate ? prev.end_date : null,
        sub_type: fields.showSubType ? prev.sub_type : null,
        rider_name: fields.showRider ? prev.rider_name : null,
        rider_premium: fields.showRider ? prev.rider_premium : null,
        maturity_value: fields.showMaturityValue ? prev.maturity_value : null,
        cash_value: fields.showCashValue ? prev.cash_value : null,
        coverage_till_age: fields.showCoverageTillAge ? prev.coverage_till_age : null,
      }
    })
  }

  function setNewPolicyFrequency(frequency: "monthly" | "yearly") {
    setNewPolicy((prev) => ({ ...prev, frequency }))
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/insurance/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Insurance policy deleted")
      onMutate()
      router.refresh()
    } catch {
      toast.error("Failed to delete")
    }
  }

  async function handleAdd() {
    if (!newPolicy.name.trim()) {
      toast.error("Policy name is required")
      return
    }
    if (newPolicy.premium_amount <= 0) {
      toast.error("Premium must be greater than 0")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/insurance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          name: newPolicy.name,
          type: newPolicy.type,
          premiumAmount: newPolicy.premium_amount,
          frequency: newPolicy.frequency,
          coverages: [
            ...newPolicy.coverages
              .filter((c) => c.coverage_amount != null && c.coverage_amount > 0)
              .map((c, i) => ({
                coverageType: c.coverage_type,
                coverageAmount: c.coverage_amount,
                benefitName: c.benefit_name ?? COVERAGE_TYPE_LABELS[c.coverage_type!],
                benefitPremium: c.benefit_premium ?? undefined,
                renewalBonus: c.renewal_bonus ?? undefined,
                benefitExpiryDate: c.benefit_expiry_date ?? undefined,
                benefitUnit: c.benefit_unit ?? undefined,
                sortOrder: i,
              })),
            ...newPolicy.customBenefits
              .filter((b) => b.benefit_name && (b.coverage_amount ?? 0) > 0)
              .map((b, i) => ({
                coverageType: b.coverage_type ?? undefined,
                coverageAmount: b.coverage_amount ?? 0,
                benefitName: b.benefit_name!,
                benefitPremium: b.benefit_premium ?? undefined,
                renewalBonus: b.renewal_bonus ?? undefined,
                benefitExpiryDate: b.benefit_expiry_date ?? undefined,
                benefitUnit: b.benefit_unit ?? undefined,
                sortOrder: newPolicy.coverages.length + i,
              })),
          ],
          yearlyOutflowDate: newPolicy.yearly_outflow_date ?? undefined,
          currentAmount: newPolicy.current_amount ?? undefined,
          endDate: newPolicy.end_date ?? undefined,
          subType: newPolicy.sub_type ?? undefined,
          riderName: newPolicy.rider_name ?? undefined,
          riderPremium: newPolicy.rider_premium ?? undefined,
          insurer: newPolicy.insurer ?? undefined,
          policyNumber: newPolicy.policy_number ?? undefined,
          maturityValue: newPolicy.maturity_value ?? undefined,
          cashValue: newPolicy.cash_value ?? undefined,
          coverageTillAge: newPolicy.coverage_till_age ?? undefined,
          inceptionDate: newPolicy.inception_date ?? undefined,
          cpfPremium: newPolicy.cpf_premium ?? undefined,
          premiumWaiver: newPolicy.premium_waiver,
          remarks: newPolicy.remarks ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to add")
      }
      toast.success("Insurance policy added")
      setNewPolicy({
        name: "",
        type: "term_life",
        premium_amount: 0,
        frequency: "yearly",
        coverage_amount: null,
        coverages: DEFAULT_COVERAGES_BY_POLICY.term_life.map((ct, i) => makeStandardCoverage(ct, i)),
        customBenefits: [],
        yearly_outflow_date: null,
        current_amount: null,
        end_date: null,
        sub_type: null,
        rider_name: null,
        rider_premium: null,
        insurer: null,
        policy_number: null,
        maturity_value: null,
        cash_value: null,
        coverage_till_age: null,
        inception_date: null,
        cpf_premium: null,
        premium_waiver: false,
        remarks: null,
      })
      setAddOpen(false)
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add")
    } finally {
      setAdding(false)
    }
  }

  const [editing, setEditing] = useState<
    Record<string, (typeof policies)[0]>
  >({})
  useEffect(() => {
    const map: Record<string, (typeof policies)[0]> = {}
    for (const p of policies) {
      map[p.id] = { ...p }
    }
    setEditing(map)
  }, [policies])

  const insuranceDirty = useMemo(
    () =>
      policies.some((p) =>
        insuranceRowDirty(editing[p.id] ?? { ...p }, p),
      ),
    [policies, editing],
  )

  const persistInsurance = useCallback(async () => {
    for (const p of policies) {
      const e = editing[p.id] ?? { ...p }
      if (!insuranceRowDirty(e, p)) continue
      const res = await fetch(`/api/insurance/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: e.name,
          type: e.type,
          premiumAmount: e.premium_amount,
          frequency: e.frequency,
          coverages: e.coverages.map((c, i) => ({
            coverageType: c.coverage_type,
            coverageAmount: c.coverage_amount,
            benefitName: c.benefit_name ?? undefined,
            benefitPremium: c.benefit_premium ?? undefined,
            renewalBonus: c.renewal_bonus ?? undefined,
            benefitExpiryDate: c.benefit_expiry_date ?? undefined,
            benefitUnit: c.benefit_unit ?? undefined,
            sortOrder: c.sort_order ?? i,
          })),
          yearlyOutflowDate: e.yearly_outflow_date ?? undefined,
          currentAmount: e.current_amount ?? undefined,
          endDate: e.end_date ?? undefined,
          subType: e.sub_type,
          riderName: e.rider_name,
          riderPremium: e.rider_premium,
          insurer: e.insurer,
          policyNumber: e.policy_number,
          maturityValue: e.maturity_value,
          cashValue: e.cash_value,
          coverageTillAge: e.coverage_till_age,
          inceptionDate: e.inception_date ?? undefined,
          cpfPremium: e.cpf_premium ?? undefined,
          premiumWaiver: e.premium_waiver ?? undefined,
          remarks: e.remarks ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to save insurance")
      }
    }
  }, [policies, editing])

  useUserSettingsSaveRegistration(`user-settings-insurance-${profileId}`, insuranceDirty, persistInsurance)

  const addInsuranceDialog = (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add insurance policy</DialogTitle>
          <DialogDescription>Add a new insurance policy for this profile.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Policy name</Label>
              <Input
                placeholder="Policy name"
                value={newPolicy.name}
                onChange={(e) => setNewPolicy((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newPolicy.type}
                onValueChange={(v) => setNewPolicyType(v as InsuranceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSURANCE_TYPES_FOR_NEW.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Insurer</Label>
              <Input
                placeholder="Insurer"
                value={newPolicy.insurer ?? ""}
                onChange={(e) => setNewPolicy((p) => ({ ...p, insurer: e.target.value || null }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Premium</Label>
              <CurrencyInput
                placeholder="Premium"
                value={newPolicy.premium_amount}
                onChange={(v) => setNewPolicy((p) => ({ ...p, premium_amount: v ?? 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={newPolicy.frequency}
                onValueChange={(v) => setNewPolicyFrequency(v as "monthly" | "yearly")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Policy #</Label>
              <Input
                placeholder="Policy #"
                value={newPolicy.policy_number ?? ""}
                onChange={(e) => setNewPolicy((p) => ({ ...p, policy_number: e.target.value || null }))}
              />
            </div>
            {ALLOWED_COVERAGES_BY_POLICY[newPolicy.type].length > 0 && (
              <div className="col-span-full space-y-2">
                <Label>Coverages</Label>
                <div className="flex flex-wrap gap-3">
                  {ALLOWED_COVERAGES_BY_POLICY[newPolicy.type].map((ct) => {
                    const entry = newPolicy.coverages.find((c) => c.coverage_type === ct)
                    const isChecked = !!entry
                    return (
                      <div key={ct} className="flex items-center gap-2">
                        <Switch
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            setNewPolicy((prev) => ({
                              ...prev,
                              coverages: checked
                                ? [...prev.coverages, makeStandardCoverage(ct, prev.coverages.length)]
                                : prev.coverages.filter((c) => c.coverage_type !== ct),
                            }))
                          }}
                        />
                        <span className="text-sm whitespace-nowrap">{COVERAGE_TYPE_LABELS[ct]}</span>
                        {isChecked && (
                          <CurrencyInput
                            placeholder="0"
                            value={entry?.coverage_amount}
                            onChange={(v) =>
                              setNewPolicy((prev) => ({
                                ...prev,
                                coverages: prev.coverages.map((c) =>
                                  c.coverage_type === ct ? { ...c, coverage_amount: v ?? null } : c,
                                ),
                              }))
                            }
                            className="h-8 w-28"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="col-span-full space-y-2">
              <div className="flex items-center justify-between">
                <Label>Custom benefits</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setNewPolicy((prev) => ({
                      ...prev,
                      customBenefits: [
                        ...prev.customBenefits,
                        {
                          coverage_type: null,
                          coverage_amount: null,
                          benefit_name: "",
                          benefit_premium: null,
                          renewal_bonus: null,
                          benefit_expiry_date: null,
                          benefit_unit: null,
                          sort_order: prev.coverages.length + prev.customBenefits.length,
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 h-3 w-3" /> Add benefit
                </Button>
              </div>
              {SUGGESTED_BENEFITS_BY_POLICY[newPolicy.type] && newPolicy.customBenefits.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Suggestions: {SUGGESTED_BENEFITS_BY_POLICY[newPolicy.type]!.slice(0, 3).join(", ")}...
                </p>
              )}
              {newPolicy.customBenefits.map((b, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <Input
                    placeholder="Benefit name"
                    value={b.benefit_name ?? ""}
                    onChange={(ev) =>
                      setNewPolicy((prev) => ({
                        ...prev,
                        customBenefits: prev.customBenefits.map((cb, i) =>
                          i === idx ? { ...cb, benefit_name: ev.target.value || null } : cb,
                        ),
                      }))
                    }
                    className="h-8 w-48"
                    list={`benefit-suggestions-${idx}`}
                  />
                  {SUGGESTED_BENEFITS_BY_POLICY[newPolicy.type] && (
                    <datalist id={`benefit-suggestions-${idx}`}>
                      {SUGGESTED_BENEFITS_BY_POLICY[newPolicy.type]!.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  )}
                  <CurrencyInput
                    placeholder="Coverage"
                    value={b.coverage_amount}
                    onChange={(v) =>
                      setNewPolicy((prev) => ({
                        ...prev,
                        customBenefits: prev.customBenefits.map((cb, i) =>
                          i === idx ? { ...cb, coverage_amount: v ?? null } : cb,
                        ),
                      }))
                    }
                    className="h-8 w-28"
                  />
                  <CurrencyInput
                    placeholder="Premium"
                    value={b.benefit_premium}
                    onChange={(v) =>
                      setNewPolicy((prev) => ({
                        ...prev,
                        customBenefits: prev.customBenefits.map((cb, i) =>
                          i === idx ? { ...cb, benefit_premium: v ?? null } : cb,
                        ),
                      }))
                    }
                    className="h-8 w-24"
                  />
                  <CurrencyInput
                    placeholder="Bonus"
                    value={b.renewal_bonus}
                    onChange={(v) =>
                      setNewPolicy((prev) => ({
                        ...prev,
                        customBenefits: prev.customBenefits.map((cb, i) =>
                          i === idx ? { ...cb, renewal_bonus: v ?? null } : cb,
                        ),
                      }))
                    }
                    className="h-8 w-24"
                  />
                  <Select
                    value={b.benefit_unit ?? "lump_sum"}
                    onValueChange={(v) =>
                      setNewPolicy((prev) => ({
                        ...prev,
                        customBenefits: prev.customBenefits.map((cb, i) =>
                          i === idx ? { ...cb, benefit_unit: v === "lump_sum" ? null : v } : cb,
                        ),
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BENEFIT_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setNewPolicy((prev) => ({
                        ...prev,
                        customBenefits: prev.customBenefits.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            {newPolicyFields.showYearlyOutflowDate && (
              <div className="space-y-2">
                <Label>Yearly due month</Label>
                <Select
                  value={newPolicy.yearly_outflow_date?.toString() ?? ""}
                  onValueChange={(v) =>
                    setNewPolicy((p) => ({ ...p, yearly_outflow_date: v ? parseInt(v, 10) : null }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={m.toString()}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newPolicyFields.showSubType && (
              <div className="space-y-2">
                <Label>Ward class</Label>
                <Select
                  value={newPolicy.sub_type ?? ""}
                  onValueChange={(v) => setNewPolicy((p) => ({ ...p, sub_type: v || null }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISP_SUB_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newPolicyFields.showRider && (
              <>
                <div className="space-y-2">
                  <Label>Rider name</Label>
                  <Input
                    placeholder="Rider"
                    value={newPolicy.rider_name ?? ""}
                    onChange={(e) => setNewPolicy((p) => ({ ...p, rider_name: e.target.value || null }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rider premium</Label>
                  <CurrencyInput
                    placeholder="0"
                    value={newPolicy.rider_premium}
                    onChange={(v) => setNewPolicy((p) => ({ ...p, rider_premium: v ?? null }))}
                  />
                </div>
              </>
            )}
            {newPolicyFields.showCoverageTillAge && (
              <div className="space-y-2">
                <Label>Coverage till age</Label>
                <Input
                  type="number"
                  placeholder="Age"
                  value={newPolicy.coverage_till_age ?? ""}
                  onChange={(e) =>
                    setNewPolicy((p) => ({
                      ...p,
                      coverage_till_age: e.target.value ? parseInt(e.target.value, 10) : null,
                    }))
                  }
                  min={1}
                />
              </div>
            )}
            {newPolicyFields.showCurrentAmount && (
              <div className="space-y-2">
                <Label>{newPolicyFields.currentAmountLabel}</Label>
                <CurrencyInput
                  placeholder="0"
                  value={newPolicy.current_amount}
                  onChange={(v) => setNewPolicy((p) => ({ ...p, current_amount: v ?? null }))}
                />
              </div>
            )}
            {newPolicyFields.showCashValue && (
              <div className="space-y-2">
                <Label>Cash value</Label>
                <CurrencyInput
                  placeholder="0"
                  value={newPolicy.cash_value}
                  onChange={(v) => setNewPolicy((p) => ({ ...p, cash_value: v ?? null }))}
                />
              </div>
            )}
            {newPolicyFields.showMaturityValue && (
              <div className="space-y-2">
                <Label>Maturity value</Label>
                <CurrencyInput
                  placeholder="0"
                  value={newPolicy.maturity_value}
                  onChange={(v) => setNewPolicy((p) => ({ ...p, maturity_value: v ?? null }))}
                />
              </div>
            )}
            {newPolicyFields.showEndDate && (
              <div className="space-y-2">
                <Label>{newPolicyFields.endDateLabel}</Label>
                <DatePicker
                  value={newPolicy.end_date ?? null}
                  onChange={(d) => setNewPolicy((p) => ({ ...p, end_date: d }))}
                  placeholder="End date"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Inception date</Label>
              <DatePicker
                value={newPolicy.inception_date ?? null}
                onChange={(d) => setNewPolicy((p) => ({ ...p, inception_date: d }))}
                placeholder="Policy start date"
              />
            </div>
            <div className="space-y-2">
              <Label>CPF premium (annual)</Label>
              <CurrencyInput
                placeholder="0"
                value={newPolicy.cpf_premium}
                onChange={(v) => setNewPolicy((p) => ({ ...p, cpf_premium: v ?? null }))}
              />
            </div>
            <div className="col-span-full flex items-center gap-2">
              <Switch
                checked={newPolicy.premium_waiver}
                onCheckedChange={(checked) =>
                  setNewPolicy((p) => ({ ...p, premium_waiver: checked }))
                }
              />
              <Label>Premium waiver benefit</Label>
            </div>
            <div className="col-span-full space-y-2">
              <Label>Remarks</Label>
              <Textarea
                placeholder="Benefit details, co-pay caps, deferred periods..."
                value={newPolicy.remarks ?? ""}
                onChange={(e) => setNewPolicy((p) => ({ ...p, remarks: e.target.value || null }))}
                rows={2}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add insurance policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (policies.length === 0) {
    return (
      <>
        <EmptyState noun="insurance policies" onAdd={() => setAddOpen(true)} />
        {addInsuranceDialog}
      </>
    )
  }

  return (
    <>
      <ScrollableTableWrapper minWidth="1050px">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Insurance - Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Insurer</TableHead>
            <TableHead>Premium</TableHead>
            <TableHead>Frequency</TableHead>
            <TableHead>Coverages</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((p) => {
            const e = editing[p.id] ?? p
            const rowFields = getFieldsForInsurancePolicyRow(
              e.type,
              e.frequency as "monthly" | "yearly",
            )
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Input
                    value={e.name}
                    onChange={(ev) =>
                      setEditing((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? p), name: ev.target.value } }))
                    }
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={e.type}
                    onValueChange={(v) => {
                      const fields = getFieldsForInsurancePolicyRow(v, e.frequency as "monthly" | "yearly")
                      const prev_e = editing[p.id] ?? p
                      const newType = v as InsuranceType
                      const allowed = ALLOWED_COVERAGES_BY_POLICY[newType] ?? []
                      const customBenefits = prev_e.coverages.filter((c) => !c.coverage_type)
                      const keptCoverages = prev_e.coverages.filter((c) => c.coverage_type && allowed.includes(c.coverage_type as CoverageType))
                      const defaults = DEFAULT_COVERAGES_BY_POLICY[newType] ?? []
                      const missingDefaults = defaults
                        .filter((ct) => !keptCoverages.some((c) => c.coverage_type === ct))
                        .map((ct) => ({ id: "", coverage_type: ct as string | null, coverage_amount: 0, benefit_name: COVERAGE_TYPE_LABELS[ct], benefit_premium: null, renewal_bonus: null, benefit_expiry_date: null, benefit_unit: null, sort_order: 0 }))
                      setEditing((prev) => ({
                        ...prev,
                        [p.id]: {
                          ...(prev[p.id] ?? p),
                          type: v,
                          coverages: [...keptCoverages, ...missingDefaults, ...customBenefits],
                          current_amount: fields.showCurrentAmount ? prev_e.current_amount : null,
                          end_date: fields.showEndDate ? prev_e.end_date : null,
                          sub_type: fields.showSubType ? prev_e.sub_type : null,
                          rider_name: fields.showRider ? prev_e.rider_name : null,
                          rider_premium: fields.showRider ? prev_e.rider_premium : null,
                          maturity_value: fields.showMaturityValue ? prev_e.maturity_value : null,
                          cash_value: fields.showCashValue ? prev_e.cash_value : null,
                          coverage_till_age: fields.showCoverageTillAge ? prev_e.coverage_till_age : null,
                        },
                      }))
                    }}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {insuranceTypeSelectItems(e.type).map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    value={e.insurer ?? ""}
                    onChange={(ev) =>
                      setEditing((prev) => ({
                        ...prev,
                        [p.id]: { ...(prev[p.id] ?? p), insurer: ev.target.value || null },
                      }))
                    }
                    placeholder="Insurer"
                    className="h-8 w-28"
                  />
                </TableCell>
                <TableCell>
                  <CurrencyInput
                    value={e.premium_amount}
                    onChange={(v) =>
                      setEditing((prev) => ({
                        ...prev,
                        [p.id]: { ...(prev[p.id] ?? p), premium_amount: v ?? 0 },
                      }))
                    }
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={e.frequency}
                    onValueChange={(v) =>
                      setEditing((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? p), frequency: v } }))
                    }
                  >
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    {ALLOWED_COVERAGES_BY_POLICY[e.type as InsuranceType]?.length > 0 && (
                      ALLOWED_COVERAGES_BY_POLICY[e.type as InsuranceType].map((ct) => {
                        const cov = e.coverages.find((c) => c.coverage_type === ct)
                        const isChecked = !!cov
                        return (
                          <div key={ct} className="flex items-center gap-1.5">
                            <Switch
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const prev_e = editing[p.id] ?? p
                                setEditing((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev_e,
                                    coverages: checked
                                      ? [...prev_e.coverages, { id: "", coverage_type: ct as string | null, coverage_amount: 0, benefit_name: COVERAGE_TYPE_LABELS[ct], benefit_premium: null, renewal_bonus: null, benefit_expiry_date: null, benefit_unit: null, sort_order: prev_e.coverages.length }]
                                      : prev_e.coverages.filter((c) => c.coverage_type !== ct),
                                  },
                                }))
                              }}
                            />
                            <span className="text-xs whitespace-nowrap">{COVERAGE_TYPE_LABELS[ct]}</span>
                            {isChecked && (
                              <CurrencyInput
                                value={cov.coverage_amount}
                                onChange={(v) => {
                                  const prev_e = editing[p.id] ?? p
                                  setEditing((prev) => ({
                                    ...prev,
                                    [p.id]: {
                                      ...prev_e,
                                      coverages: prev_e.coverages.map((c) =>
                                        c.coverage_type === ct ? { ...c, coverage_amount: v ?? 0 } : c,
                                      ),
                                    },
                                  }))
                                }}
                                className="h-7 w-24"
                              />
                            )}
                          </div>
                        )
                      })
                    )}
                    {e.coverages.filter((c) => !c.coverage_type).map((cb, idx) => (
                      <div key={`custom-${idx}`} className="flex items-center gap-1.5 rounded border border-dashed p-1">
                        <Input
                          value={cb.benefit_name ?? ""}
                          onChange={(ev) => {
                            const prev_e = editing[p.id] ?? p
                            const customIdx = prev_e.coverages.filter((c) => !c.coverage_type).indexOf(cb)
                            let ci = 0
                            setEditing((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...prev_e,
                                coverages: prev_e.coverages.map((c) => {
                                  if (c.coverage_type) return c
                                  if (ci++ === customIdx) return { ...c, benefit_name: ev.target.value || null }
                                  return c
                                }),
                              },
                            }))
                          }}
                          placeholder="Benefit"
                          className="h-7 w-32"
                        />
                        <CurrencyInput
                          value={cb.coverage_amount}
                          onChange={(v) => {
                            const prev_e = editing[p.id] ?? p
                            const customIdx = prev_e.coverages.filter((c) => !c.coverage_type).indexOf(cb)
                            let ci = 0
                            setEditing((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...prev_e,
                                coverages: prev_e.coverages.map((c) => {
                                  if (c.coverage_type) return c
                                  if (ci++ === customIdx) return { ...c, coverage_amount: v ?? 0 }
                                  return c
                                }),
                              },
                            }))
                          }}
                          className="h-7 w-20"
                        />
                        <CurrencyInput
                          value={cb.benefit_premium}
                          onChange={(v) => {
                            const prev_e = editing[p.id] ?? p
                            const customIdx = prev_e.coverages.filter((c) => !c.coverage_type).indexOf(cb)
                            let ci = 0
                            setEditing((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...prev_e,
                                coverages: prev_e.coverages.map((c) => {
                                  if (c.coverage_type) return c
                                  if (ci++ === customIdx) return { ...c, benefit_premium: v ?? null }
                                  return c
                                }),
                              },
                            }))
                          }}
                          placeholder="Prem"
                          className="h-7 w-20"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            const prev_e = editing[p.id] ?? p
                            const customIdx = prev_e.coverages.filter((c) => !c.coverage_type).indexOf(cb)
                            let ci = 0
                            setEditing((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...prev_e,
                                coverages: prev_e.coverages.filter((c) => {
                                  if (c.coverage_type) return true
                                  return ci++ !== customIdx
                                }),
                              },
                            }))
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => {
                        const prev_e = editing[p.id] ?? p
                        setEditing((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...prev_e,
                            coverages: [
                              ...prev_e.coverages,
                              { id: "", coverage_type: null, coverage_amount: 0, benefit_name: "", benefit_premium: null, renewal_bonus: null, benefit_expiry_date: null, benefit_unit: null, sort_order: prev_e.coverages.length },
                            ],
                          },
                        }))
                      }}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Benefit
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {rowFields.showYearlyOutflowDate && (
                      <Select
                        value={e.yearly_outflow_date?.toString() ?? ""}
                        onValueChange={(val) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? p),
                              yearly_outflow_date: val ? parseInt(val, 10) : null,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 w-16">
                          <SelectValue placeholder="Due" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <SelectItem key={m} value={m.toString()}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {rowFields.showSubType && (
                      <Select
                        value={e.sub_type ?? ""}
                        onValueChange={(v) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] ?? p), sub_type: v || null },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue placeholder="Ward" />
                        </SelectTrigger>
                        <SelectContent>
                          {ISP_SUB_TYPES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {rowFields.showRider && (
                      <>
                        <Input
                          value={e.rider_name ?? ""}
                          onChange={(ev) =>
                            setEditing((prev) => ({
                              ...prev,
                              [p.id]: { ...(prev[p.id] ?? p), rider_name: ev.target.value || null },
                            }))
                          }
                          placeholder="Rider"
                          className="h-8 w-24"
                        />
                        <CurrencyInput
                          value={e.rider_premium ?? undefined}
                          onChange={(v) =>
                            setEditing((prev) => ({
                              ...prev,
                              [p.id]: { ...(prev[p.id] ?? p), rider_premium: v ?? null },
                            }))
                          }
                          placeholder="Rider $"
                          className="h-8 w-20"
                        />
                      </>
                    )}
                    {rowFields.showCoverageTillAge && (
                      <Input
                        type="number"
                        value={e.coverage_till_age ?? ""}
                        onChange={(ev) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...(prev[p.id] ?? p),
                              coverage_till_age: ev.target.value ? parseInt(ev.target.value, 10) : null,
                            },
                          }))
                        }
                        placeholder="Till age"
                        className="h-8 w-20"
                        min={1}
                      />
                    )}
                    {rowFields.showCurrentAmount && (
                      <CurrencyInput
                        value={e.current_amount ?? undefined}
                        onChange={(v) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] ?? p), current_amount: v ?? null },
                          }))
                        }
                        className="h-8 w-20"
                        placeholder={rowFields.currentAmountLabel}
                      />
                    )}
                    {rowFields.showCashValue && (
                      <CurrencyInput
                        value={e.cash_value ?? undefined}
                        onChange={(v) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] ?? p), cash_value: v ?? null },
                          }))
                        }
                        className="h-8 w-20"
                        placeholder="Cash val"
                      />
                    )}
                    {rowFields.showMaturityValue && (
                      <CurrencyInput
                        value={e.maturity_value ?? undefined}
                        onChange={(v) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] ?? p), maturity_value: v ?? null },
                          }))
                        }
                        className="h-8 w-20"
                        placeholder="Maturity"
                      />
                    )}
                    {rowFields.showEndDate && (
                      <DatePicker
                        value={e.end_date ?? null}
                        onChange={(d) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] ?? p), end_date: d },
                          }))
                        }
                        placeholder={rowFields.endDateLabel}
                        className="h-8 w-28"
                      />
                    )}
                    <Input
                      value={e.policy_number ?? ""}
                      onChange={(ev) =>
                        setEditing((prev) => ({
                          ...prev,
                          [p.id]: { ...(prev[p.id] ?? p), policy_number: ev.target.value || null },
                        }))
                      }
                      placeholder="Policy #"
                      className="h-8 w-24"
                    />
                    <DatePicker
                      value={e.inception_date ?? null}
                      onChange={(d) =>
                        setEditing((prev) => ({
                          ...prev,
                          [p.id]: { ...(prev[p.id] ?? p), inception_date: d },
                        }))
                      }
                      placeholder="Inception"
                      className="h-8 w-28"
                    />
                    <CurrencyInput
                      value={e.cpf_premium ?? undefined}
                      onChange={(v) =>
                        setEditing((prev) => ({
                          ...prev,
                          [p.id]: { ...(prev[p.id] ?? p), cpf_premium: v ?? null },
                        }))
                      }
                      placeholder="CPF prem"
                      className="h-8 w-20"
                    />
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={e.premium_waiver ?? false}
                        onCheckedChange={(checked) =>
                          setEditing((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] ?? p), premium_waiver: checked },
                          }))
                        }
                      />
                      <span className="text-xs whitespace-nowrap">Waiver</span>
                    </div>
                    <Input
                      value={e.remarks ?? ""}
                      onChange={(ev) =>
                        setEditing((prev) => ({
                          ...prev,
                          [p.id]: { ...(prev[p.id] ?? p), remarks: ev.target.value || null },
                        }))
                      }
                      placeholder="Remarks"
                      className="h-8 w-40"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </ScrollableTableWrapper>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add insurance policy
      </Button>
      {addInsuranceDialog}
    </>
  )
}

function AddFamilyMemberDialog({
  familyId,
  familyName,
  open,
  onOpenChange,
  onSuccess,
}: {
  familyId: string
  familyName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [createState, createAction, isCreatePending] = useActionState(createProfile, {
    success: false,
    error: undefined,
  })

  useEffect(() => {
    if (createState.success) {
      toast.success("Family member added successfully")
      onOpenChange(false)
      onSuccess()
    } else if (createState.error) {
      toast.error(createState.error)
    }
  }, [createState, onOpenChange, onSuccess])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={true}>
        <DialogHeader>
          <DialogTitle>Add family member</DialogTitle>
          <DialogDescription>
            Add a new member to {familyName}. You can configure their financial data after creation.
          </DialogDescription>
        </DialogHeader>
        <form action={createAction} className="space-y-4">
          <input type="hidden" name="familyId" value={familyId} />
          <div className="space-y-2">
            <label htmlFor="add-name" className="text-sm font-medium">
              Name
            </label>
            <Input id="add-name" name="name" placeholder="e.g. Jane" required />
          </div>
          <div className="space-y-2">
            <label htmlFor="add-birthYear" className="text-sm font-medium">
              Birth Year
            </label>
            <Input
              id="add-birthYear"
              name="birthYear"
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              placeholder="e.g. 1990"
              required
            />
          </div>
          <DialogFooter showCloseButton={false}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreatePending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreatePending}>
              {isCreatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditFamilyNameDialog({
  familyId,
  familyName,
  open,
  onOpenChange,
  onSuccess,
}: {
  familyId: string
  familyName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(familyName)
  const [updateState, updateAction, isUpdatePending] = useActionState(updateFamilyName, {
    success: false,
    error: undefined,
  })

  useEffect(() => {
    if (open) {
      setName(familyName)
    }
  }, [open, familyName])

  useEffect(() => {
    if (updateState.success) {
      toast.success("Family name updated")
      onOpenChange(false)
      onSuccess()
    } else if (updateState.error) {
      toast.error(updateState.error)
    }
  }, [updateState, onOpenChange, onSuccess])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={true}>
        <DialogHeader>
          <DialogTitle>Edit family name</DialogTitle>
          <DialogDescription>
            Change the display name for this family group.
          </DialogDescription>
        </DialogHeader>
        <form action={updateAction} className="space-y-4">
          <input type="hidden" name="familyId" value={familyId} />
          <div className="space-y-2">
            <Label htmlFor="edit-family-name">Name</Label>
            <Input
              id="edit-family-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Family"
              maxLength={50}
              required
            />
          </div>
          <DialogFooter showCloseButton={false}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUpdatePending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdatePending}>
              {isUpdatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UserSettingsActiveContext() {
  const { families, activeFamilyId, profiles, activeProfileId } = useActiveProfile()
  const family = families.find((f) => f.id === activeFamilyId)
  const profile = profiles.find((p) => p.id === activeProfileId)
  const familyName = family?.name ?? "—"
  const profileName = profile?.name ?? (profiles.length > 0 ? "Combined" : "—")
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Viewing: <span className="font-medium text-foreground">{familyName}</span>
      {" / "}
      <span className="font-medium text-foreground">{profileName}</span>
    </p>
  )
}

function filterByProfile<T extends { profile_id: string | null }>(
  items: T[],
  profileId: string
): T[] {
  return items.filter((i) => i.profile_id === profileId || i.profile_id === null)
}

function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  const a = parts[0]?.[0] ?? "?"
  const b = parts.length > 1 ? parts[parts.length - 1]![0] : ""
  return (a + b).toUpperCase()
}

function FamilyMemberSettingsPanels({
  p,
  family,
  financialData,
  profiles,
  handleMutate,
}: {
  p: ProfileWithIncome
  family: { id: string; name: string }
  financialData: FinancialDataByFamily
  profiles: ProfileWithIncome[]
  handleMutate: () => void
}) {
  const profileBanks = filterByProfile(financialData.bankAccounts, p.id)
  const profileGoals = filterByProfile(financialData.savingsGoals, p.id)
  const profileInvestments = filterByProfile(financialData.investments, p.id)
  const profileLoans = financialData.loans.filter((l) => l.profile_id === p.id)
  const profilePolicies = financialData.insurancePolicies.filter((pol) => pol.profile_id === p.id)
  const cpfData = financialData.cpfBalances.find((c) => c.profile_id === p.id)

  const profileLogs = financialData.monthlyCashflow.filter((l) => l.profile_id === p.id)
  const telegramBadge = p.telegram_user_id ? "Connected" : "Not linked"

  return (
    <div className="space-y-3">
      <SectionGroupLabel>Personal</SectionGroupLabel>
      <CollapsibleSection title="Profile" badge="Edit" defaultOpen>
        <ProfileSection profile={p} profileCount={profiles.length} />
      </CollapsibleSection>
      <CollapsibleSection title="Telegram" badge={telegramBadge} defaultOpen>
        <TelegramSection profile={p} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Monthly Log"
        badge={profileLogs.length > 0 ? `${profileLogs.length} entries` : "No entries"}
        defaultOpen
      >
        <MonthlyLogSection
          profileId={p.id}
          profileName={p.name}
          logs={financialData.monthlyCashflow}
          familyId={family.id}
          onMutate={handleMutate}
        />
      </CollapsibleSection>

      <SectionGroupLabel>Assets</SectionGroupLabel>
      <CollapsibleSection
        title="Banks"
        badge={profileBanks.length > 0 ? `${profileBanks.length} accounts` : "None"}
      >
        <BanksSection
          banks={profileBanks}
          profileId={p.id}
          familyId={family.id}
          primaryBankAccountId={p.primary_bank_account_id ?? null}
          onMutate={handleMutate}
        />
      </CollapsibleSection>
      <CollapsibleSection
        title="CPF"
        badge={cpfData ? "Set" : "Not set"}
      >
        <CPFSection profileId={p.id} cpfData={cpfData} familyId={family.id} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Investments"
        badge={profileInvestments.length > 0 ? `${profileInvestments.length} holdings` : "None"}
      >
        <InvestmentsSection
          investments={profileInvestments}
          profileId={p.id}
          familyId={family.id}
          onMutate={handleMutate}
        />
      </CollapsibleSection>
      <CollapsibleSection
        title="Savings Goals"
        badge={profileGoals.length > 0 ? `${profileGoals.length} goals` : "None"}
      >
        <SavingsGoalsSection
          goals={profileGoals}
          profileId={p.id}
          familyId={family.id}
          bankAccounts={profileBanks}
          onMutate={handleMutate}
        />
      </CollapsibleSection>

      <SectionGroupLabel>Liabilities</SectionGroupLabel>
      <CollapsibleSection
        title="Loans"
        badge={profileLoans.length > 0 ? `${profileLoans.length} loans` : "None"}
      >
        <LoansSection loans={profileLoans} profileId={p.id} onMutate={handleMutate} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Loan Repayments"
        badge={profileLoans.length > 0 ? `${profileLoans.length} loans` : "None"}
      >
        <LoanRepaymentsSection loans={profileLoans} profileId={p.id} onMutate={handleMutate} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Insurance"
        badge={profilePolicies.length > 0 ? `${profilePolicies.length} policies` : "None"}
      >
        <InsuranceSection policies={profilePolicies} profileId={p.id} onMutate={handleMutate} />
      </CollapsibleSection>
    </div>
  )
}

export function FamilyMembersTable({
  family,
  profiles,
  financialData,
  familyCount,
}: {
  family: { id: string; name: string }
  profiles: ProfileWithIncome[]
  financialData: FinancialDataByFamily
  familyCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(profiles[0]?.id ?? "add")
  const [tabsResetKey, setTabsResetKey] = useState(0)
  const saveCtx = useOptionalUserSettingsSave()
  const hasUnsavedChanges = saveCtx?.aggregateDirty ?? false
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false)
  const pendingNavigationRef = useRef<
    { type: "tab"; tab: string } | { type: "route"; href: string } | null
  >(null)
  const discardUnsavedInProgressRef = useRef(false)

  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteFamily, {
    success: false,
    error: undefined,
  })

  const updateProfileInUrl = useCallback(
    (profileId: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (profiles.some((p) => p.id === profileId)) {
        params.set("profile", profileId)
      } else {
        params.delete("profile")
      }
      const q = params.toString()
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
    },
    [pathname, profiles, router, searchParams]
  )

  const confirmDiscardUnsaved = useCallback(() => {
    discardUnsavedInProgressRef.current = true
    const pending = pendingNavigationRef.current
    pendingNavigationRef.current = null
    setUnsavedDialogOpen(false)
    if (pending?.type === "tab") {
      setTabsResetKey((k) => k + 1)
      setActiveTab(pending.tab)
      updateProfileInUrl(pending.tab)
    } else if (pending?.type === "route") {
      router.push(pending.href)
    }
    queueMicrotask(() => {
      discardUnsavedInProgressRef.current = false
    })
  }, [router, updateProfileInUrl])

  const handleProfileChange = useCallback(
    (next: string) => {
      if (next === activeTab) return
      if (!hasUnsavedChanges) {
        setActiveTab(next)
        updateProfileInUrl(next)
        return
      }
      pendingNavigationRef.current = { type: "tab", tab: next }
      setUnsavedDialogOpen(true)
    },
    [activeTab, hasUnsavedChanges, updateProfileInUrl]
  )

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const el = e.target
      if (!(el instanceof Element)) return
      const a = el.closest("a[href]")
      if (!a) return
      if (a.hasAttribute("download")) return
      const href = a.getAttribute("href")
      if (!href || href.startsWith("#")) return
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return
      let url: URL
      try {
        url = new URL(href, window.location.origin)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      const nextPath = `${url.pathname}${url.search}${url.hash}`
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (nextPath === here) return

      e.preventDefault()
      e.stopPropagation()
      pendingNavigationRef.current = { type: "route", href: nextPath }
      setUnsavedDialogOpen(true)
    }
    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (profiles.length === 0) {
      setActiveTab("add")
      return
    }
    const pidFromUrl = searchParams.get("profile")
    if (pidFromUrl && profiles.some((p) => p.id === pidFromUrl)) {
      if (!hasUnsavedChanges && pidFromUrl !== activeTab) {
        setActiveTab(pidFromUrl)
      }
      return
    }
    if (!profiles.some((p) => p.id === activeTab)) {
      const next = profiles[0]!.id
      setActiveTab(next)
      if (!hasUnsavedChanges) {
        const params = new URLSearchParams(searchParams.toString())
        params.set("profile", next)
        const q = params.toString()
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
      }
    }
  }, [profiles, activeTab, searchParams, hasUnsavedChanges, pathname, router])

  useEffect(() => {
    if (deleteState.success) {
      setDeleteDialogOpen(false)
      toast.success("Family removed")
      router.refresh()
    } else if (deleteState.error) {
      toast.error(deleteState.error)
    }
  }, [deleteState, router])

  const handleMutate = useCallback(() => router.refresh(), [router])
  const canDeleteFamily = familyCount > 1
  const activeProfile = profiles.find((p) => p.id === activeTab)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{family.name}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setEditDialogOpen(true)}
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit family name</span>
              </Button>
              {canDeleteFamily && (
                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete family</span>
                  </Button>
                  <DialogContent showCloseButton={true}>
                    <DialogHeader>
                      <DialogTitle>Delete family</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete &quot;{family.name}&quot;? This will permanently remove
                        all profiles in this family and their associated data (banks, investments, loans,
                        insurance, CPF, cashflow, etc.). This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <form action={deleteAction} className="contents">
                      <input type="hidden" name="familyId" value={family.id} />
                      <DialogFooter showCloseButton={false}>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDeleteDialogOpen(false)}
                          disabled={isDeletePending}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" variant="destructive" disabled={isDeletePending}>
                          {isDeletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Delete
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <CardDescription>
              Choose a family member to edit their profile and financial data. Save or discard before
              switching to another person.
            </CardDescription>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} variant="outline" size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add family member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {profiles.length > 0 && (
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
            <div className="md:hidden">
              <Label htmlFor={`member-select-${family.id}`} className="mb-2 block text-muted-foreground">
                Family member
              </Label>
              <Select value={activeTab} onValueChange={handleProfileChange}>
                <SelectTrigger id={`member-select-${family.id}`} className="w-full">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <nav
              className="hidden min-w-[11rem] shrink-0 flex-col gap-1 md:flex"
              aria-label="Family members"
            >
              {profiles.map((p) => {
                const isActive = activeTab === p.id
                const isDirty = saveCtx?.isProfileDirty(p.id) ?? false
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProfileChange(p.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-muted font-medium text-foreground ring-1 ring-foreground/10"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium ring-1 ring-foreground/10"
                      aria-hidden
                    >
                      {profileInitials(p.name)}
                    </span>
                    <span className="min-w-0 truncate">{p.name}</span>
                    {isDirty && (
                      <span
                        className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unsaved changes"
                      />
                    )}
                  </button>
                )
              })}
            </nav>

            <div className="min-w-0 flex-1 space-y-4">
              {activeProfile && (
                <>
                  <FamilyMemberSettingsPanels
                    key={`${activeProfile.id}-${tabsResetKey}`}
                    p={activeProfile}
                    family={family}
                    financialData={financialData}
                    profiles={profiles}
                    handleMutate={handleMutate}
                  />
                </>
              )}
            </div>
          </div>
        )}

        <AlertDialog
          open={unsavedDialogOpen}
          onOpenChange={(open) => {
            setUnsavedDialogOpen(open)
            if (!open && !discardUnsavedInProgressRef.current) {
              pendingNavigationRef.current = null
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes on this page. If you leave now, those edits will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmDiscardUnsaved()}>Discard changes</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {profiles.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <p className="mb-4">No family members yet.</p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add your first family member
            </Button>
          </div>
        )}

        <AddFamilyMemberDialog
          familyId={family.id}
          familyName={family.name}
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onSuccess={handleMutate}
        />
        <EditFamilyNameDialog
          familyId={family.id}
          familyName={family.name}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={handleMutate}
        />
      </CardContent>
    </Card>
  )
}
