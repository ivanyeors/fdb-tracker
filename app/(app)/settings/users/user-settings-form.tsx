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
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SymbolPickerDrawer } from "@/components/dashboard/investments/symbol-picker-drawer"
import { formatCurrency } from "@/lib/utils"
import {
  getFieldsForInsurancePolicyRow,
  type InsuranceType,
} from "@/lib/insurance/coverage-config"
import {
  updateUserProfile,
  deleteUserProfile,
  createProfile,
  updateFamilyName,
  deleteFamily,
} from "../actions"
import { toast } from "sonner"
import { Loader2, Trash2, UserPlus, ExternalLink, Plus, FileText, X, Pencil } from "lucide-react"
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

const LOAN_TYPES = [
  { value: "housing", label: "Housing" },
  { value: "personal", label: "Personal" },
  { value: "car", label: "Car" },
  { value: "education", label: "Education" },
] as const

const INSURANCE_TYPES_FOR_NEW = [
  { value: "term_life" satisfies InsuranceType, label: "Term Life" },
  { value: "whole_life" satisfies InsuranceType, label: "Whole Life" },
  { value: "integrated_shield" satisfies InsuranceType, label: "Integrated Shield" },
  { value: "critical_illness" satisfies InsuranceType, label: "Critical Illness" },
  { value: "endowment" satisfies InsuranceType, label: "Endowment" },
  { value: "personal_accident" satisfies InsuranceType, label: "Personal Accident" },
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
    profile_id: string | null
  }>
  investments: Array<{
    id: string
    symbol: string
    type: string
    units: number
    cost_basis: number
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
    (e.deadline ?? null) !== (g.deadline ?? null) ||
    e.category !== g.category ||
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

function insuranceRowDirty(
  e: FinancialDataByFamily["insurancePolicies"][0] & { current_amount?: number | null; end_date?: string | null },
  p: FinancialDataByFamily["insurancePolicies"][0]
): boolean {
  const pCa = (p as { current_amount?: number | null }).current_amount ?? null
  const pEd = (p as { end_date?: string | null }).end_date ?? null
  return (
    e.name !== p.name ||
    e.type !== p.type ||
    e.premium_amount !== p.premium_amount ||
    e.frequency !== p.frequency ||
    (e.coverage_amount ?? null) !== (p.coverage_amount ?? null) ||
    (e.yearly_outflow_date ?? null) !== (p.yearly_outflow_date ?? null) ||
    (e.current_amount ?? null) !== pCa ||
    (e.end_date ?? null) !== pEd
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
      dpsInclude !== dpsBaseline
    )
  }, [
    name,
    birthYear,
    annualSalary,
    bonusEstimate,
    payFrequency,
    employeeCpfRate,
    dpsInclude,
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
  }, [profile.id, profile.name, profile.birth_year, profile.income_config, profile.dps_include_in_projection])

  const canDelete = profileCount > 1

  return (
    <>
      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Profile</h3>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Birth Year</TableHead>
              <TableHead>Annual Salary</TableHead>
              <TableHead>Bonus</TableHead>
              <TableHead>Pay Freq</TableHead>
              <TableHead>CPF %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 w-full min-w-[100px]"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  value={birthYear}
                  onChange={(e) => setBirthYear(Number(e.target.value) || 1990)}
                  className="h-8 w-20"
                />
              </TableCell>
              <TableCell>
                <CurrencyInput
                  value={annualSalary}
                  onChange={(v) => setAnnualSalary(v ?? 0)}
                  className="h-8 w-28"
                />
              </TableCell>
              <TableCell>
                <CurrencyInput
                  value={bonusEstimate}
                  onChange={(v) => setBonusEstimate(v ?? 0)}
                  className="h-8 w-28"
                />
              </TableCell>
              <TableCell>
                <Select
                  value={payFrequency}
                  onValueChange={(v) => setPayFrequency(v as "monthly" | "bi-monthly" | "weekly")}
                >
                  <SelectTrigger className="h-8 w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="bi-monthly">Bi-Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={employeeCpfRate}
                  onChange={(e) => setEmployeeCpfRate(e.target.value)}
                  placeholder="Default"
                  className="h-8 w-16"
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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
      <SectionTitle>Telegram Integration</SectionTitle>
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
  onMutate,
}: {
  banks: FinancialDataByFamily["bankAccounts"]
  profileId: string
  familyId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
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

  if (banks.length === 0 && !adding) {
    return (
      <>
        <SectionTitle>Banks</SectionTitle>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No bank accounts. Add one below.</p>
          <div className="flex flex-wrap gap-2 rounded-lg border p-3">
            <Input
              placeholder="Bank name"
              value={newBank.bank_name}
              onChange={(e) => setNewBank((p) => ({ ...p, bank_name: e.target.value }))}
              className="h-8 w-32"
            />
            <Select
              value={newBank.account_type}
              onValueChange={(v) => setNewBank((p) => ({ ...p, account_type: v as typeof newBank.account_type }))}
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
            <CurrencyInput
              placeholder="Balance"
              value={newBank.opening_balance}
              onChange={(v) => setNewBank((p) => ({ ...p, opening_balance: v ?? 0 }))}
              className="h-8 w-28"
            />
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SectionTitle>Banks</SectionTitle>
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
          <TableRow>
            <TableCell colSpan={6} className="border-t">
              <div className="flex flex-wrap gap-2 pt-2">
                <Input
                  placeholder="Bank name"
                  value={newBank.bank_name}
                  onChange={(e) => setNewBank((p) => ({ ...p, bank_name: e.target.value }))}
                  className="h-8 w-32"
                />
                <Select
                  value={newBank.account_type}
                  onValueChange={(v) => setNewBank((p) => ({ ...p, account_type: v as typeof newBank.account_type }))}
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
                <CurrencyInput
                  placeholder="Balance"
                  value={newBank.opening_balance}
                  onChange={(v) => setNewBank((p) => ({ ...p, opening_balance: v ?? 0 }))}
                  className="h-8 w-24"
                />
                <CurrencyInput
                  placeholder="Locked"
                  value={newBank.locked_amount}
                  onChange={(v) => setNewBank((p) => ({ ...p, locked_amount: v ?? 0 }))}
                  className="h-8 w-24"
                />
                <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add bank
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  )
}

function SavingsGoalsSection({
  goals,
  profileId,
  familyId,
  onMutate,
}: {
  goals: FinancialDataByFamily["savingsGoals"]
  profileId: string
  familyId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [newGoal, setNewGoal] = useState({
    name: "",
    target_amount: 0,
    current_amount: 0,
    deadline: "" as string | null,
    category: "custom" as const,
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
          deadline: newGoal.deadline || null,
          category: newGoal.category,
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
        deadline: null,
        category: "custom",
      })
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
          deadline: e.deadline,
          category: e.category,
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

  if (goals.length === 0 && !adding) {
    return (
      <>
        <SectionTitle>Savings Goals</SectionTitle>
        <p className="text-sm text-muted-foreground">No savings goals. Add one to get started.</p>
        <div className="flex flex-wrap gap-2 rounded-lg border p-3 mt-2">
          <Input
            placeholder="Goal name"
            value={newGoal.name}
            onChange={(e) => setNewGoal((p) => ({ ...p, name: e.target.value }))}
            className="h-8 w-32"
          />
          <CurrencyInput
            placeholder="Target"
            value={newGoal.target_amount}
            onChange={(v) => setNewGoal((p) => ({ ...p, target_amount: v ?? 0 }))}
            className="h-8 w-24"
          />
          <Button size="sm" onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add goal
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <SectionTitle>Savings Goals</SectionTitle>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Goal - Name</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Current</TableHead>
            <TableHead>Deadline</TableHead>
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
                  />
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
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow>
            <TableCell colSpan={5} className="border-t">
              <div className="flex flex-wrap gap-2 pt-2">
                <Input
                  placeholder="Goal name"
                  value={newGoal.name}
                  onChange={(e) => setNewGoal((p) => ({ ...p, name: e.target.value }))}
                  className="h-8 w-32"
                />
                <CurrencyInput
                  placeholder="Target"
                  value={newGoal.target_amount}
                  onChange={(v) => setNewGoal((p) => ({ ...p, target_amount: v ?? 0 }))}
                  className="h-8 w-24"
                />
                <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add goal
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
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
  const [isEditingCpf, setIsEditingCpf] = useState(false)
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
    isEditingCpf &&
    (oa !== (cpfData?.oa ?? 0) || sa !== (cpfData?.sa ?? 0) || ma !== (cpfData?.ma ?? 0))

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
    setIsEditingCpf(false)
  }, [profileId, familyId, currentMonth, oa, sa, ma])

  useUserSettingsSaveRegistration(`user-settings-cpf-${profileId}`, cpfDirty, persistCpf)

  function handleCancel() {
    setOa(cpfData?.oa ?? 0)
    setSa(cpfData?.sa ?? 0)
    setMa(cpfData?.ma ?? 0)
    setIsEditingCpf(false)
  }

  return (
    <>
      <SectionTitle>CPF</SectionTitle>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>OA</TableHead>
            <TableHead>SA</TableHead>
            <TableHead>MA</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            {isEditingCpf ? (
              <>
                <TableCell>
                  <CurrencyInput value={oa} onChange={(v) => setOa(v ?? 0)} className="h-8 w-28" />
                </TableCell>
                <TableCell>
                  <CurrencyInput value={sa} onChange={(v) => setSa(v ?? 0)} className="h-8 w-28" />
                </TableCell>
                <TableCell>
                  <CurrencyInput value={ma} onChange={(v) => setMa(v ?? 0)} className="h-8 w-28" />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    Cancel
                  </Button>
                </TableCell>
              </>
            ) : (
              <>
                <TableCell className="text-muted-foreground">
                  ${formatCurrency(oa)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  ${formatCurrency(sa)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  ${formatCurrency(ma)}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setIsEditingCpf(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </TableCell>
              </>
            )}
          </TableRow>
        </TableBody>
      </Table>
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
      <SectionTitle>Monthly</SectionTitle>
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
          className="flex w-[50vw] max-w-[50vw] flex-col gap-0 p-0 data-[side=right]:w-[50vw] data-[side=right]:max-w-[50vw] sm:max-w-[50vw]"
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
            <div className="grid grid-cols-2 gap-4">
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

  if (investments.length === 0 && !adding) {
    return (
      <>
        <SectionTitle>Investments</SectionTitle>
        <InvestmentCashBalanceSettings
          profileId={profileId}
          familyId={familyId}
          onMutate={onMutate}
        />
        <p className="text-sm text-muted-foreground">No investments. Add one below.</p>
        <div className="flex flex-wrap gap-4 rounded-lg border p-3 mt-2">
          <div className="space-y-1">
            <Label>{newInv.type === "ilp" ? "Policy name" : "Symbol"}</Label>
            {isGoldOrSilver(newInv.type) ? (
              <Input value={effectiveNewSymbol} disabled className="h-8 w-24 bg-muted" />
            ) : newInv.type === "ilp" ? (
              <Input
                placeholder="e.g. Prudential ILP"
                value={newInv.symbol}
                onChange={(e) => setNewInv((p) => ({ ...p, symbol: e.target.value }))}
                className="h-8 w-32"
              />
            ) : effectiveNewSymbol ? (
              <div className="flex items-center gap-1">
                <span className="inline-flex h-8 items-center gap-1 rounded-md border bg-muted px-2 text-sm font-medium">
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
              <Button size="sm" variant="outline" onClick={() => setSymbolDrawerOpen(true)}>
                <Plus className="mr-2 size-3.5" />
                Add symbol
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={newInv.type}
              onValueChange={(v) => onNewInvestmentTypeChange(v as InvestmentKind)}
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
          </div>
          <div className="space-y-1">
            <Label>Units</Label>
            <Input
              type="number"
              step="any"
              min={0}
              placeholder="0"
              value={newUnitsInput}
              onChange={(ev) => setNewUnitsInput(ev.target.value)}
              className="h-8 w-20"
            />
          </div>
          <div className="space-y-1">
            <Label>Cost per unit</Label>
            <CurrencyInput
              placeholder="Avg. price per unit"
              value={newInv.cost_basis}
              onChange={(v) => setNewInv((p) => ({ ...p, cost_basis: v ?? 0 }))}
              className="h-8 w-24"
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={handleAdd} disabled={adding || !effectiveNewSymbol.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
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
  }

  return (
    <>
      <SectionTitle>Investments</SectionTitle>
      <InvestmentCashBalanceSettings
        profileId={profileId}
        familyId={familyId}
        onMutate={onMutate}
      />
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
          <TableRow>
            <TableCell colSpan={7} className="border-t">
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="space-y-1">
                  <Label>{newInv.type === "ilp" ? "Policy name" : "Symbol"}</Label>
                  {isGoldOrSilver(newInv.type) ? (
                    <Input value={effectiveNewSymbol} disabled className="h-8 w-24 bg-muted" />
                  ) : newInv.type === "ilp" ? (
                    <Input
                      placeholder="e.g. Prudential ILP"
                      value={newInv.symbol}
                      onChange={(e) => setNewInv((p) => ({ ...p, symbol: e.target.value }))}
                      className="h-8 w-32"
                    />
                  ) : effectiveNewSymbol ? (
                    <div className="flex items-center gap-1">
                      <span className="inline-flex h-8 items-center gap-1 rounded-md border bg-muted px-2 text-sm font-medium">
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
                    <Button size="sm" variant="outline" onClick={() => setSymbolDrawerOpen(true)}>
                      <Plus className="mr-2 size-3.5" />
                      Add symbol
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={newInv.type}
                    onValueChange={(v) => onNewInvestmentTypeChange(v as InvestmentKind)}
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
                </div>
                <div className="space-y-1">
                  <Label>Units</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="0"
                    value={newUnitsInput}
                    onChange={(ev) => setNewUnitsInput(ev.target.value)}
                    className="h-8 w-20"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cost per unit</Label>
                  <CurrencyInput
                    placeholder="Avg. price per unit"
                    value={newInv.cost_basis}
                    onChange={(v) => setNewInv((p) => ({ ...p, cost_basis: v ?? 0 }))}
                    className="h-8 w-24"
                  />
                </div>
                <div className="flex items-end">
                  <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding || !effectiveNewSymbol.trim()}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add investment
                  </Button>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <SymbolPickerDrawer
        open={symbolDrawerOpen || symbolDrawerEditId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSymbolDrawerOpen(false)
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
          } else {
            setNewInv((prev) => ({ ...prev, symbol: s }))
            setSymbolDrawerOpen(false)
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

  if (loans.length === 0 && !adding) {
    return (
      <>
        <SectionTitle>Loans</SectionTitle>
        <p className="text-sm text-muted-foreground">No loans. Add one below.</p>
        <div className="flex flex-wrap gap-4 rounded-lg border p-3 mt-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              placeholder="Loan name"
              value={newLoan.name}
              onChange={(e) => setNewLoan((p) => ({ ...p, name: e.target.value }))}
              className="h-8 w-28"
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={newLoan.type}
              onValueChange={(v) => setNewLoan((p) => ({ ...p, type: v as typeof newLoan.type }))}
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
          </div>
          <div className="space-y-1">
            <Label>Principal</Label>
            <CurrencyInput
              placeholder="Principal"
              value={newLoan.principal}
              onChange={(v) => setNewLoan((p) => ({ ...p, principal: v ?? 0 }))}
              className="h-8 w-24"
            />
          </div>
          <div className="space-y-1">
            <Label>Rate %</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              placeholder="0"
              value={newLoan.rate_pct || ""}
              onChange={(e) =>
                setNewLoan((p) => ({ ...p, rate_pct: Number(e.target.value) || 0 }))
              }
              className="h-8 w-20"
            />
          </div>
          <div className="space-y-1">
            <Label>Tenure (mo)</Label>
            <Input
              type="number"
              min={1}
              placeholder="Months"
              value={newLoan.tenure_months || ""}
              onChange={(e) =>
                setNewLoan((p) => ({ ...p, tenure_months: Number(e.target.value) || 0 }))
              }
              className="h-8 w-20"
            />
          </div>
          <div className="space-y-1">
            <Label>Start Date</Label>
            <DatePicker
              value={newLoan.start_date || null}
              onChange={(d) => setNewLoan((p) => ({ ...p, start_date: d ?? "" }))}
              placeholder="Start date"
              className="h-8 w-32"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="new-loan-cpf-empty"
              type="checkbox"
              className="h-4 w-4 rounded border border-input"
              checked={newLoan.use_cpf_oa}
              onChange={(ev) =>
                setNewLoan((p) => ({ ...p, use_cpf_oa: ev.target.checked }))
              }
            />
            <Label htmlFor="new-loan-cpf-empty" className="font-normal cursor-pointer">
              CPF OA
            </Label>
          </div>
          <div className="space-y-1">
            <Label>VL (120% cap)</Label>
            <CurrencyInput
              placeholder="Optional"
              value={newLoan.valuation_limit ?? undefined}
              onChange={(v) => setNewLoan((p) => ({ ...p, valuation_limit: v ?? null }))}
              className="h-8 w-24"
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add loan
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SectionTitle>Loans</SectionTitle>
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
          <TableRow>
            <TableCell colSpan={9} className="border-t">
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    placeholder="Loan name"
                    value={newLoan.name}
                    onChange={(e) => setNewLoan((p) => ({ ...p, name: e.target.value }))}
                    className="h-8 w-28"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={newLoan.type}
                    onValueChange={(v) => setNewLoan((p) => ({ ...p, type: v as typeof newLoan.type }))}
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
                </div>
                <div className="space-y-1">
                  <Label>Principal</Label>
                  <CurrencyInput
                    placeholder="Principal"
                    value={newLoan.principal}
                    onChange={(v) => setNewLoan((p) => ({ ...p, principal: v ?? 0 }))}
                    className="h-8 w-24"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Rate %</Label>
                  <Input
                    type="number"
                    step={0.01}
                    min={0}
                    placeholder="0"
                    value={newLoan.rate_pct || ""}
                    onChange={(e) =>
                      setNewLoan((p) => ({ ...p, rate_pct: Number(e.target.value) || 0 }))
                    }
                    className="h-8 w-20"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tenure (mo)</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Months"
                    value={newLoan.tenure_months || ""}
                    onChange={(e) =>
                      setNewLoan((p) => ({ ...p, tenure_months: Number(e.target.value) || 0 }))
                    }
                    className="h-8 w-20"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Start Date</Label>
                  <DatePicker
                    value={newLoan.start_date || null}
                    onChange={(d) => setNewLoan((p) => ({ ...p, start_date: d ?? "" }))}
                    placeholder="Start date"
                    className="h-8 w-32"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="new-loan-cpf-row"
                    type="checkbox"
                    className="h-4 w-4 rounded border border-input"
                    checked={newLoan.use_cpf_oa}
                    onChange={(ev) =>
                      setNewLoan((p) => ({ ...p, use_cpf_oa: ev.target.checked }))
                    }
                  />
                  <Label htmlFor="new-loan-cpf-row" className="font-normal cursor-pointer">
                    CPF OA
                  </Label>
                </div>
                <div className="space-y-1">
                  <Label>VL</Label>
                  <CurrencyInput
                    placeholder="Optional"
                    value={newLoan.valuation_limit ?? undefined}
                    onChange={(v) => setNewLoan((p) => ({ ...p, valuation_limit: v ?? null }))}
                    className="h-8 w-24"
                  />
                </div>
                <div className="flex items-end">
                  <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add loan
                  </Button>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
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
      <SectionTitle>Loan repayments</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Log instalments here. If you enter a CPF OA portion and the loan uses CPF OA, a matching monthly
        housing tranche is created for the CPF dashboard.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="space-y-1">
          <Label>Loan</Label>
          <Select value={form.loanId} onValueChange={(loanId) => setForm((f) => ({ ...f, loanId }))}>
            <SelectTrigger className="h-8 w-48">
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
        <div className="space-y-1">
          <Label>Date</Label>
          <DatePicker
            value={form.date || null}
            onChange={(d) => setForm((f) => ({ ...f, date: d ?? "" }))}
            placeholder="Date"
            className="h-8 w-36"
          />
        </div>
        <div className="space-y-1">
          <Label>Amount</Label>
          <CurrencyInput
            className="h-8 w-28"
            value={form.amount || undefined}
            onChange={(v) => setForm((f) => ({ ...f, amount: v ?? 0 }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1">
            CPF OA
            <InfoTooltip id="CPF_HOUSING_REFUND" />
          </Label>
          <CurrencyInput
            placeholder="Optional"
            className="h-8 w-28"
            value={form.cpfOaAmount ?? undefined}
            onChange={(v) => setForm((f) => ({ ...f, cpfOaAmount: v ?? null }))}
          />
        </div>
        <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add repayment
        </Button>
      </div>

      <div className="mt-4 rounded-md border">
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
  const [newPolicy, setNewPolicy] = useState<{
    name: string
    type: InsuranceType
    premium_amount: number
    frequency: "monthly" | "yearly"
    coverage_amount: number | null
    yearly_outflow_date: number | null
    current_amount: number | null
    end_date: string | null
  }>({
    name: "",
    type: "term_life",
    premium_amount: 0,
    frequency: "yearly",
    coverage_amount: null,
    yearly_outflow_date: null,
    current_amount: null,
    end_date: null,
  })

  const newPolicyFields = getFieldsForInsurancePolicyRow(newPolicy.type, newPolicy.frequency)

  function setNewPolicyType(type: InsuranceType) {
    setNewPolicy((prev) => {
      const fields = getFieldsForInsurancePolicyRow(type, prev.frequency)
      return {
        ...prev,
        type,
        current_amount: fields.showCurrentAmount ? prev.current_amount : null,
        end_date: fields.showEndDate ? prev.end_date : null,
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
          coverageAmount: newPolicy.coverage_amount ?? undefined,
          yearlyOutflowDate: newPolicy.yearly_outflow_date ?? undefined,
          currentAmount: newPolicy.current_amount ?? undefined,
          endDate: newPolicy.end_date ?? undefined,
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
        yearly_outflow_date: null,
        current_amount: null,
        end_date: null,
      })
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add")
    } finally {
      setAdding(false)
    }
  }

  const [editing, setEditing] = useState<
    Record<string, (typeof policies)[0] & { current_amount?: number | null; end_date?: string | null }>
  >({})
  useEffect(() => {
    const map: Record<string, (typeof policies)[0] & { current_amount?: number | null; end_date?: string | null }> = {}
    for (const p of policies) {
      map[p.id] = {
        ...p,
        current_amount: (p as { current_amount?: number | null }).current_amount ?? null,
        end_date: (p as { end_date?: string | null }).end_date ?? null,
      }
    }
    setEditing(map)
  }, [policies])

  const insuranceDirty = useMemo(
    () =>
      policies.some((p) =>
        insuranceRowDirty(
          editing[p.id] ?? {
            ...p,
            current_amount: (p as { current_amount?: number | null }).current_amount ?? null,
            end_date: (p as { end_date?: string | null }).end_date ?? null,
          },
          p
        )
      ),
    [policies, editing]
  )

  const persistInsurance = useCallback(async () => {
    for (const p of policies) {
      const e =
        editing[p.id] ??
        ({
          ...p,
          current_amount: (p as { current_amount?: number | null }).current_amount ?? null,
          end_date: (p as { end_date?: string | null }).end_date ?? null,
        } as (typeof policies)[0] & { current_amount?: number | null; end_date?: string | null })
      if (!insuranceRowDirty(e, p)) continue
      const res = await fetch(`/api/insurance/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: e.name,
          type: e.type,
          premiumAmount: e.premium_amount,
          frequency: e.frequency,
          coverageAmount: e.coverage_amount ?? undefined,
          yearlyOutflowDate: e.yearly_outflow_date ?? undefined,
          currentAmount: e.current_amount ?? undefined,
          endDate: e.end_date ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to save insurance")
      }
    }
  }, [policies, editing])

  useUserSettingsSaveRegistration(`user-settings-insurance-${profileId}`, insuranceDirty, persistInsurance)

  if (policies.length === 0 && !adding) {
    return (
      <>
        <SectionTitle>Insurance</SectionTitle>
        <p className="text-sm text-muted-foreground">No insurance policies. Add one below.</p>
        <div className="flex flex-wrap gap-4 rounded-lg border p-3 mt-2">
          <div className="space-y-1">
            <Label>Policy name</Label>
            <Input
              placeholder="Policy name"
              value={newPolicy.name}
              onChange={(e) => setNewPolicy((p) => ({ ...p, name: e.target.value }))}
              className="h-8 w-32"
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={newPolicy.type}
              onValueChange={(v) => setNewPolicyType(v as InsuranceType)}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSURANCE_TYPES_FOR_NEW.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Premium</Label>
            <CurrencyInput
              placeholder="Premium"
              value={newPolicy.premium_amount}
              onChange={(v) => setNewPolicy((p) => ({ ...p, premium_amount: v ?? 0 }))}
              className="h-8 w-24"
            />
          </div>
          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select
              value={newPolicy.frequency}
              onValueChange={(v) => setNewPolicyFrequency(v as "monthly" | "yearly")}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newPolicyFields.showCoverageAmount && (
            <div className="space-y-1">
              <Label>{newPolicyFields.coverageAmountLabel}</Label>
              <CurrencyInput
                placeholder="0"
                value={newPolicy.coverage_amount}
                onChange={(v) => setNewPolicy((p) => ({ ...p, coverage_amount: v ?? null }))}
                className="h-8 w-24"
              />
            </div>
          )}
          {newPolicyFields.showYearlyOutflowDate && (
            <div className="space-y-1">
              <Label>Yearly due month</Label>
              <Select
                value={newPolicy.yearly_outflow_date?.toString() ?? ""}
                onValueChange={(v) =>
                  setNewPolicy((p) => ({ ...p, yearly_outflow_date: v ? parseInt(v, 10) : null }))
                }
              >
                <SelectTrigger className="h-8 w-24">
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
          {newPolicyFields.showCurrentAmount && (
            <div className="space-y-1">
              <Label>{newPolicyFields.currentAmountLabel}</Label>
              <CurrencyInput
                placeholder="0"
                value={newPolicy.current_amount}
                onChange={(v) => setNewPolicy((p) => ({ ...p, current_amount: v ?? null }))}
                className="h-8 w-24"
              />
            </div>
          )}
          {newPolicyFields.showEndDate && (
            <div className="space-y-1">
              <Label>{newPolicyFields.endDateLabel}</Label>
              <DatePicker
                value={newPolicy.end_date ?? null}
                onChange={(d) => setNewPolicy((p) => ({ ...p, end_date: d }))}
                placeholder="End date"
                className="h-8 w-32"
              />
            </div>
          )}
          <div className="flex items-end">
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SectionTitle>Insurance</SectionTitle>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Insurance - Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Premium</TableHead>
            <TableHead>Frequency</TableHead>
            <TableHead>Coverage</TableHead>
            <TableHead>Yearly due</TableHead>
            <TableHead>Current / End</TableHead>
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
                      setEditing((prev) => ({
                        ...prev,
                        [p.id]: {
                          ...(prev[p.id] ?? p),
                          type: v,
                          current_amount: fields.showCurrentAmount ? (prev[p.id] ?? p).current_amount : null,
                          end_date: fields.showEndDate ? (prev[p.id] ?? p).end_date : null,
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
                  <CurrencyInput
                    value={e.coverage_amount ?? undefined}
                    onChange={(v) =>
                      setEditing((prev) => ({
                        ...prev,
                        [p.id]: { ...(prev[p.id] ?? p), coverage_amount: v ?? null },
                      }))
                    }
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  {rowFields.showYearlyOutflowDate ? (
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
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <SelectItem key={m} value={m.toString()}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {rowFields.showCurrentAmount || rowFields.showEndDate ? (
                    <div className="flex flex-wrap gap-1">
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
                          placeholder="0"
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
                          placeholder="End date"
                          className="h-8 w-28"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow>
            <TableCell colSpan={8} className="border-t">
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="space-y-1">
                  <Label>Policy name</Label>
                  <Input
                    placeholder="Policy name"
                    value={newPolicy.name}
                    onChange={(e) => setNewPolicy((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-8 w-32"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={newPolicy.type}
                    onValueChange={(v) => setNewPolicyType(v as InsuranceType)}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INSURANCE_TYPES_FOR_NEW.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Premium</Label>
                  <CurrencyInput
                    placeholder="Premium"
                    value={newPolicy.premium_amount}
                    onChange={(v) => setNewPolicy((prev) => ({ ...prev, premium_amount: v ?? 0 }))}
                    className="h-8 w-24"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Frequency</Label>
                  <Select
                    value={newPolicy.frequency}
                    onValueChange={(v) => setNewPolicyFrequency(v as "monthly" | "yearly")}
                  >
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newPolicyFields.showCoverageAmount && (
                  <div className="space-y-1">
                    <Label>{newPolicyFields.coverageAmountLabel}</Label>
                    <CurrencyInput
                      placeholder="0"
                      value={newPolicy.coverage_amount}
                      onChange={(v) => setNewPolicy((prev) => ({ ...prev, coverage_amount: v ?? null }))}
                      className="h-8 w-24"
                    />
                  </div>
                )}
                {newPolicyFields.showYearlyOutflowDate && (
                  <div className="space-y-1">
                    <Label>Yearly due month</Label>
                    <Select
                      value={newPolicy.yearly_outflow_date?.toString() ?? ""}
                      onValueChange={(v) =>
                        setNewPolicy((prev) => ({ ...prev, yearly_outflow_date: v ? parseInt(v, 10) : null }))
                      }
                    >
                      <SelectTrigger className="h-8 w-24">
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
                {newPolicyFields.showCurrentAmount && (
                  <div className="space-y-1">
                    <Label>{newPolicyFields.currentAmountLabel}</Label>
                    <CurrencyInput
                      placeholder="0"
                      value={newPolicy.current_amount}
                      onChange={(v) => setNewPolicy((prev) => ({ ...prev, current_amount: v ?? null }))}
                      className="h-8 w-24"
                    />
                  </div>
                )}
                {newPolicyFields.showEndDate && (
                  <div className="space-y-1">
                    <Label>{newPolicyFields.endDateLabel}</Label>
                    <DatePicker
                      value={newPolicy.end_date ?? null}
                      onChange={(d) => setNewPolicy((prev) => ({ ...prev, end_date: d }))}
                      placeholder="End date"
                      className="h-8 w-32"
                    />
                  </div>
                )}
                <div className="flex items-end">
                  <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add insurance
                  </Button>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
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

  const confirmDiscardUnsaved = useCallback(() => {
    discardUnsavedInProgressRef.current = true
    const pending = pendingNavigationRef.current
    pendingNavigationRef.current = null
    setUnsavedDialogOpen(false)
    if (pending?.type === "tab") {
      setTabsResetKey((k) => k + 1)
      setActiveTab(pending.tab)
    } else if (pending?.type === "route") {
      router.push(pending.href)
    }
    queueMicrotask(() => {
      discardUnsavedInProgressRef.current = false
    })
  }, [router])

  const handleTabChange = useCallback(
    (next: string) => {
      if (next === activeTab) return
      if (!hasUnsavedChanges) {
        setActiveTab(next)
        return
      }
      pendingNavigationRef.current = { type: "tab", tab: next }
      setUnsavedDialogOpen(true)
    },
    [activeTab, hasUnsavedChanges]
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
    if (profiles.length > 0 && !profiles.some((p) => p.id === activeTab)) {
      setActiveTab(profiles[0]!.id)
    } else if (profiles.length === 0) {
      setActiveTab("add")
    }
  }, [profiles, activeTab])

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
              Edit profile and financial data. Each tab shows one family member&apos;s data.
            </CardDescription>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} variant="outline" size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add family member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="min-w-0 max-w-full overflow-x-auto no-scrollbar [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch]">
            <TabsList className="inline-flex h-9 w-fit flex-nowrap">
              {profiles.map((p) => (
                <TabsTrigger key={p.id} value={p.id} className="text-sm shrink-0 px-3">
                  {p.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {profiles.map((p) => {
            const profileBanks = filterByProfile(financialData.bankAccounts, p.id)
            const profileGoals = filterByProfile(financialData.savingsGoals, p.id)
            const profileInvestments = filterByProfile(financialData.investments, p.id)
            const profileLoans = financialData.loans.filter((l) => l.profile_id === p.id)
            const profilePolicies = financialData.insurancePolicies.filter((pol) => pol.profile_id === p.id)
            const cpfData = financialData.cpfBalances.find((c) => c.profile_id === p.id)

            return (
              <TabsContent
                key={`${p.id}-${tabsResetKey}`}
                value={p.id}
                forceMount
                className="mt-4 space-y-2"
              >
                <MonthlyLogSection
                  profileId={p.id}
                  profileName={p.name}
                  logs={financialData.monthlyCashflow}
                  familyId={family.id}
                  onMutate={handleMutate}
                />
                <ProfileSection profile={p} profileCount={profiles.length} />
                <TelegramSection profile={p} />
                <BanksSection
                  banks={profileBanks}
                  profileId={p.id}
                  familyId={family.id}
                  onMutate={handleMutate}
                />
                <SavingsGoalsSection
                  goals={profileGoals}
                  profileId={p.id}
                  familyId={family.id}
                  onMutate={handleMutate}
                />
                <CPFSection profileId={p.id} cpfData={cpfData} familyId={family.id} />
                <InvestmentsSection
                  investments={profileInvestments}
                  profileId={p.id}
                  familyId={family.id}
                  onMutate={handleMutate}
                />
                <LoansSection loans={profileLoans} profileId={p.id} onMutate={handleMutate} />
                <LoanRepaymentsSection loans={profileLoans} profileId={p.id} onMutate={handleMutate} />
                <InsuranceSection policies={profilePolicies} profileId={p.id} onMutate={handleMutate} />
              </TabsContent>
            )
          })}
        </Tabs>

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
