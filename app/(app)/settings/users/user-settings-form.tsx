"use client"

/* eslint-disable react-hooks/set-state-in-effect -- sync UI state with server action results and prop changes */
import { useActionState, useEffect, useState } from "react"
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
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
  getFieldsForType,
  type InsuranceType,
} from "@/lib/insurance/coverage-config"
import { updateUserProfile, deleteUserProfile, createProfile } from "../actions"
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

const LOAN_TYPES = [
  { value: "housing", label: "Housing" },
  { value: "personal", label: "Personal" },
  { value: "car", label: "Car" },
  { value: "education", label: "Education" },
] as const

const INSURANCE_TYPES = [
  { value: "term_life", label: "Term Life" },
  { value: "whole_life", label: "Whole Life" },
  { value: "integrated_shield", label: "Integrated Shield" },
  { value: "critical_illness", label: "Critical Illness" },
  { value: "endowment", label: "Endowment" },
  { value: "ilp", label: "ILP" },
  { value: "personal_accident", label: "Personal Accident" },
] as const

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

function ProfileSection({
  profile,
  profileCount,
}: {
  profile: ProfileWithIncome
  profileCount: number
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [state, action, isPending] = useActionState(updateUserProfile, {
    success: false,
    error: undefined,
  })
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

  useEffect(() => {
    if (state.success) {
      toast.success(`${profile.name}'s profile updated successfully`)
    } else if (state.error) {
      toast.error(state.error)
    }
  }, [state, profile.name])

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
  }, [profile.id, profile.name, profile.birth_year, profile.income_config])

  const canDelete = profileCount > 1

  return (
    <>
      <SectionTitle>Profile</SectionTitle>
      <form action={action} data-profile-id={profile.id}>
        <input type="hidden" name="profileId" value={profile.id} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="birthYear" value={birthYear} />
        <input type="hidden" name="annualSalary" value={annualSalary} />
        <input type="hidden" name="bonusEstimate" value={bonusEstimate} />
        <input type="hidden" name="payFrequency" value={payFrequency} />
        <input type="hidden" name="employeeCpfRate" value={employeeCpfRate || ""} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Birth Year</TableHead>
              <TableHead>Annual Salary</TableHead>
              <TableHead>Bonus</TableHead>
              <TableHead>Pay Freq</TableHead>
              <TableHead>CPF %</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
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
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
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
                  <Button type="submit" size="sm" disabled={isPending}>
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </form>
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
              Copy this token and send <code className="bg-background px-1 rounded border">/link {token}</code> to the Telegram bot to connect.
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
  const [savingId, setSavingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newBank, setNewBank] = useState({
    bank_name: "",
    account_type: "savings" as const,
    opening_balance: 0,
    interest_rate_pct: 0,
    locked_amount: 0,
  })

  async function handleSave(account: (typeof banks)[0]) {
    setSavingId(account.id)
    try {
      const res = await fetch(`/api/bank-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: account.bank_name,
          accountType: account.account_type,
          profileId: account.profile_id,
          openingBalance: account.opening_balance,
          interestRatePct: account.interest_rate_pct ?? 0,
          lockedAmount: account.locked_amount ?? 0,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save")
      }
      toast.success("Bank account updated")
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingId(null)
    }
  }

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
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(b.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      disabled={savingId === b.id}
                      onClick={() => handleSave(e)}
                    >
                      {savingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
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
  const [savingId, setSavingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newGoal, setNewGoal] = useState({
    name: "",
    target_amount: 0,
    current_amount: 0,
    deadline: "" as string | null,
    category: "custom" as const,
  })

  async function handleSave(goal: (typeof goals)[0]) {
    setSavingId(goal.id)
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: goal.name,
          targetAmount: goal.target_amount,
          currentAmount: goal.current_amount,
          deadline: goal.deadline,
          category: goal.category,
          profileId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save")
      }
      toast.success("Savings goal updated")
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingId(null)
    }
  }

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
                  <Input
                    type="date"
                    value={e.deadline ?? ""}
                    onChange={(ev) =>
                      setEditing((p) => ({
                        ...p,
                        [g.id]: { ...(p[g.id] ?? g), deadline: ev.target.value || null },
                      }))
                    }
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" disabled={savingId === g.id} onClick={() => handleSave(e)}>
                      {savingId === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
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
  onMutate,
}: {
  profileId: string
  cpfData: FinancialDataByFamily["cpfBalances"][0] | undefined
  familyId: string
  onMutate: () => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
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

  async function handleSave() {
    setSaving(true)
    try {
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
        throw new Error(data.error ?? "Failed to save")
      }
      toast.success("CPF balances updated")
      setIsEditingCpf(false)
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

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
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={saving} onClick={handleSave}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
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
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const [month, setMonth] = useState(defaultMonth)
  const [inflow, setInflow] = useState(0)
  const [outflow, setOutflow] = useState(0)

  const profileLogs = logs.filter((l) => l.profile_id === profileId)

  async function handleSave() {
    setSaving(true)
    try {
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
        throw new Error(data.error ?? "Failed to save")
      }
      toast.success("Inflow/outflow logged")
      setInflow(0)
      setOutflow(0)
      setMonth(defaultMonth)
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function formatMonth(m: string) {
    const [y, mo] = m.slice(0, 10).split("-")
    const d = new Date(Number(y), Number(mo) - 1, 1)
    return d.toLocaleDateString("en-SG", { year: "numeric", month: "short" })
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

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
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

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
            <div className="space-y-2">
              <Label htmlFor="log-month">Month</Label>
              <DatePicker
                id="log-month"
                value={month}
                onChange={(d) => {
                  if (d) setMonth(d)
                  else setMonth(defaultMonth)
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>

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
                        className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <span className="font-medium">{formatMonth(entry.month)}</span>
                        <span className="text-muted-foreground">
                          In: ${Number(entry.inflow ?? 0).toLocaleString()} · Out: ${Number(entry.outflow ?? 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
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
  const [savingId, setSavingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newInv, setNewInv] = useState({
    symbol: "",
    type: "stock" as const,
    units: 0,
    cost_basis: 0,
  })

  async function handleSave(inv: (typeof investments)[0]) {
    setSavingId(inv.id)
    try {
      const res = await fetch(`/api/investments/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: inv.symbol,
          type: inv.type,
          units: inv.units,
          costBasis: inv.cost_basis,
          profileId: inv.profile_id,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save")
      }
      toast.success("Investment updated")
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingId(null)
    }
  }

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
    if (!newInv.symbol.trim()) {
      toast.error("Symbol is required")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: newInv.symbol,
          type: newInv.type,
          units: newInv.units,
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
      setNewInv({ symbol: "", type: "stock", units: 0, cost_basis: 0 })
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

  const isGoldOrSilver = (t: string) => t === "gold" || t === "silver"
  const effectiveNewSymbol =
    isGoldOrSilver(newInv.type) ? (newInv.type === "gold" ? "Gold" : "Silver") : newInv.symbol

  if (investments.length === 0 && !adding) {
    return (
      <>
        <SectionTitle>Investments</SectionTitle>
        <p className="text-sm text-muted-foreground">No investments. Add one below.</p>
        <div className="flex flex-wrap gap-4 rounded-lg border p-3 mt-2">
          <div className="space-y-1">
            <Label>Symbol</Label>
            {isGoldOrSilver(newInv.type) ? (
              <Input value={effectiveNewSymbol} disabled className="h-8 w-24 bg-muted" />
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
              onValueChange={(v) => setNewInv((p) => ({ ...p, type: v as typeof newInv.type }))}
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
            <CurrencyInput
              placeholder="Units"
              value={newInv.units}
              onChange={(v) => setNewInv((p) => ({ ...p, units: v ?? 0 }))}
              className="h-8 w-20"
            />
          </div>
          <div className="space-y-1">
            <Label>Cost basis</Label>
            <CurrencyInput
              placeholder="Cost basis"
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Investment - Symbol</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Units</TableHead>
            <TableHead>Cost Basis</TableHead>
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
                    onValueChange={(v) =>
                      setEditing((p) => ({ ...p, [inv.id]: { ...(p[inv.id] ?? inv), type: v } }))
                    }
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
                  <CurrencyInput
                    value={e.units}
                    onChange={(v) =>
                      setEditing((p) => ({ ...p, [inv.id]: { ...(p[inv.id] ?? inv), units: v ?? 0 } }))
                    }
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
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(inv.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" disabled={savingId === inv.id} onClick={() => handleSave(e)}>
                      {savingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow>
            <TableCell colSpan={5} className="border-t">
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="space-y-1">
                  <Label>Symbol</Label>
                  {isGoldOrSilver(newInv.type) ? (
                    <Input value={effectiveNewSymbol} disabled className="h-8 w-24 bg-muted" />
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
                    onValueChange={(v) => setNewInv((p) => ({ ...p, type: v as typeof newInv.type }))}
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
                  <CurrencyInput
                    placeholder="Units"
                    value={newInv.units}
                    onChange={(v) => setNewInv((p) => ({ ...p, units: v ?? 0 }))}
                    className="h-8 w-20"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cost basis</Label>
                  <CurrencyInput
                    placeholder="Cost basis"
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
  const [savingId, setSavingId] = useState<string | null>(null)
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
  })

  async function handleSave(loan: (typeof loans)[0]) {
    setSavingId(loan.id)
    try {
      const res = await fetch(`/api/loans/${loan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: loan.name,
          type: loan.type,
          principal: loan.principal,
          ratePct: loan.rate_pct,
          tenureMonths: loan.tenure_months,
          startDate: loan.start_date,
          lender: loan.lender,
          useCpfOa: loan.use_cpf_oa,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save")
      }
      toast.success("Loan updated")
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingId(null)
    }
  }

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
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to add")
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
      map[l.id] = { ...l }
    }
    setEditing(map)
  }, [loans])

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
            <Input
              type="date"
              value={newLoan.start_date}
              onChange={(e) => setNewLoan((p) => ({ ...p, start_date: e.target.value }))}
              className="h-8 w-32"
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
                  <Input
                    type="date"
                    value={e.start_date}
                    onChange={(ev) =>
                      setEditing((p) => ({ ...p, [l.id]: { ...(p[l.id] ?? l), start_date: ev.target.value } }))
                    }
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(l.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" disabled={savingId === l.id} onClick={() => handleSave(e)}>
                      {savingId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow>
            <TableCell colSpan={7} className="border-t">
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
                  <Input
                    type="date"
                    value={newLoan.start_date}
                    onChange={(e) => setNewLoan((p) => ({ ...p, start_date: e.target.value }))}
                    className="h-8 w-32"
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
  const [savingId, setSavingId] = useState<string | null>(null)
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

  const newPolicyFields = getFieldsForType(newPolicy.type, newPolicy.frequency)

  function setNewPolicyType(type: InsuranceType) {
    setNewPolicy((prev) => {
      const fields = getFieldsForType(type, prev.frequency)
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

  async function handleSave(policy: (typeof policies)[0] & { current_amount?: number | null; end_date?: string | null }) {
    setSavingId(policy.id)
    try {
      const res = await fetch(`/api/insurance/${policy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: policy.name,
          type: policy.type,
          premiumAmount: policy.premium_amount,
          frequency: policy.frequency,
          coverageAmount: policy.coverage_amount ?? undefined,
          yearlyOutflowDate: policy.yearly_outflow_date ?? undefined,
          currentAmount: policy.current_amount ?? undefined,
          endDate: policy.end_date ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save")
      }
      toast.success("Insurance policy updated")
      onMutate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingId(null)
    }
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
                {INSURANCE_TYPES.map((t) => (
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
              <Input
                type="date"
                value={newPolicy.end_date ?? ""}
                onChange={(e) => setNewPolicy((p) => ({ ...p, end_date: e.target.value || null }))}
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
            const rowFields = getFieldsForType(
              e.type as InsuranceType,
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
                      const fields = getFieldsForType(v as InsuranceType, e.frequency as "monthly" | "yearly")
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
                      {INSURANCE_TYPES.map((t) => (
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
                        <Input
                          type="date"
                          value={e.end_date ?? ""}
                          onChange={(ev) =>
                            setEditing((prev) => ({
                              ...prev,
                              [p.id]: { ...(prev[p.id] ?? p), end_date: ev.target.value || null },
                            }))
                          }
                          className="h-8 w-28"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" disabled={savingId === p.id} onClick={() => handleSave(e)}>
                      {savingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
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
                      {INSURANCE_TYPES.map((t) => (
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
                    <Input
                      type="date"
                      value={newPolicy.end_date ?? ""}
                      onChange={(e) => setNewPolicy((prev) => ({ ...prev, end_date: e.target.value || null }))}
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
}: {
  family: { id: string; name: string }
  profiles: ProfileWithIncome[]
  financialData: FinancialDataByFamily
}) {
  const router = useRouter()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(profiles[0]?.id ?? "add")

  useEffect(() => {
    if (profiles.length > 0 && !profiles.some((p) => p.id === activeTab)) {
      setActiveTab(profiles[0]!.id)
    } else if (profiles.length === 0) {
      setActiveTab("add")
    }
  }, [profiles, activeTab])

  const handleMutate = () => router.refresh()

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{family.name}</CardTitle>
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
              <TabsContent key={p.id} value={p.id} className="mt-4 space-y-2">
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
                <CPFSection
                  profileId={p.id}
                  cpfData={cpfData}
                  familyId={family.id}
                  onMutate={handleMutate}
                />
                <InvestmentsSection
                  investments={profileInvestments}
                  profileId={p.id}
                  familyId={family.id}
                  onMutate={handleMutate}
                />
                <LoansSection loans={profileLoans} profileId={p.id} onMutate={handleMutate} />
                <InsuranceSection policies={profilePolicies} profileId={p.id} onMutate={handleMutate} />
              </TabsContent>
            )
          })}
        </Tabs>

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
          onSuccess={() => router.refresh()}
        />
      </CardContent>
    </Card>
  )
}
