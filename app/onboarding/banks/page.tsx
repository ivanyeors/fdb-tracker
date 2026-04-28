"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ButtonSelect } from "@/components/ui/button-select"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DatePicker } from "@/components/ui/date-picker"
import {
  useOnboarding,
  pathWithMode,
  type BankAccount,
  type SavingsGoal,
} from "@/components/onboarding/onboarding-provider"
import {
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

const PROFILE_OPTION_KEYS = [
  "person-alpha",
  "person-bravo",
  "person-charlie",
  "person-delta",
  "person-echo",
  "person-foxtrot",
  "person-golf",
  "person-hotel",
]

const ACCOUNT_TYPES = [
  { value: "ocbc_360", label: "OCBC 360" },
  { value: "basic", label: "Basic Savings" },
  { value: "savings", label: "Savings" },
  { value: "fixed_deposit", label: "Fixed Deposit" },
  { value: "srs", label: "SRS" },
] as const

function isOcbcAccount(account: BankAccount) {
  return (
    account.account_type === "ocbc_360" ||
    account.bank_name.toUpperCase().includes("OCBC")
  )
}

export default function BanksPage() {
  const router = useRouter()
  const { mode, profiles, userCount, bankAccounts, setBankAccounts, familyId, skipOnboarding } = useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<BankAccount[]>(
    bankAccounts.length > 0
      ? bankAccounts.map((acc) => ({
          ...acc,
          opening_balance: acc.opening_balance ?? 0,
          savings_goals: acc.savings_goals.map((g) => ({
            ...g,
            deadline: g.deadline ?? null,
          })),
        }))
      : [{ bank_name: "", account_type: "savings", opening_balance: 0, savings_goals: [], profileIndex: 0 }],
  )
  const [accountKeys, setAccountKeys] = useState<string[]>(() =>
    Array.from({ length: bankAccounts.length > 0 ? bankAccounts.length : 1 }, () => crypto.randomUUID()),
  )
  const [showGoals, setShowGoals] = useState<Record<number, boolean>>({})

  function updateAccount(
    index: number,
    field: keyof BankAccount,
    value: string | number,
  ) {
    const updated = [...accounts]
    if (field === "account_type") {
      updated[index] = {
        ...updated[index],
        account_type: value as BankAccount["account_type"],
      }
    } else if (field === "bank_name") {
      updated[index] = { ...updated[index], bank_name: value as string }
    } else if (field === "opening_balance") {
      updated[index] = {
        ...updated[index],
        opening_balance: typeof value === "number" ? value : Number(value) || 0,
      }
    } else if (field === "profileIndex") {
      updated[index] = {
        ...updated[index],
        profileIndex: typeof value === "number" ? value : Number(value) || 0,
      }
    }
    setAccounts(updated)
  }

  function addAccount() {
    setAccounts([
      ...accounts,
      { bank_name: "", account_type: "savings", opening_balance: 0, savings_goals: [], profileIndex: 0 },
    ])
    setAccountKeys([...accountKeys, crypto.randomUUID()])
  }

  function removeAccount(index: number) {
    setAccounts(accounts.filter((_, i) => i !== index))
    setAccountKeys(accountKeys.filter((_, i) => i !== index))
    setShowGoals((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  function toggleGoals(index: number, enabled: boolean) {
    setShowGoals((prev) => ({ ...prev, [index]: enabled }))
    if (enabled && accounts[index].savings_goals.length === 0) {
      const updated = [...accounts]
      updated[index] = {
        ...updated[index],
        savings_goals: [
          { name: "", target_amount: null, current_amount: 0, deadline: null },
        ],
      }
      setAccounts(updated)
    }
    if (!enabled) {
      const updated = [...accounts]
      updated[index] = { ...updated[index], savings_goals: [] }
      setAccounts(updated)
    }
  }

  function updateGoal(
    accountIdx: number,
    goalIdx: number,
    field: keyof SavingsGoal,
    value: string | number | null,
  ) {
    const updated = [...accounts]
    const goals = [...updated[accountIdx].savings_goals]
    if (field === "name") {
      goals[goalIdx] = { ...goals[goalIdx], name: value as string }
    } else if (field === "deadline") {
      goals[goalIdx] = {
        ...goals[goalIdx],
        deadline: value === "" || value === null || value === undefined ? null : (value as string),
      }
    } else {
      const numValue = (() => {
        if (value === "" || value === null || value === undefined) {
          return field === "current_amount" ? 0 : null
        }
        return typeof value === "number" ? value : Number(value)
      })()
      goals[goalIdx] = { ...goals[goalIdx], [field]: numValue }
    }
    updated[accountIdx] = { ...updated[accountIdx], savings_goals: goals }
    setAccounts(updated)
  }

  function addGoal(accountIdx: number) {
    const updated = [...accounts]
    updated[accountIdx] = {
      ...updated[accountIdx],
      savings_goals: [
        ...updated[accountIdx].savings_goals,
        { name: "", target_amount: null, current_amount: 0, deadline: null },
      ],
    }
    setAccounts(updated)
  }

  function removeGoal(accountIdx: number, goalIdx: number) {
    const updated = [...accounts]
    updated[accountIdx] = {
      ...updated[accountIdx],
      savings_goals: updated[accountIdx].savings_goals.filter(
        (_, i) => i !== goalIdx,
      ),
    }
    setAccounts(updated)
  }

  async function handleNext() {
    const valid = accounts.filter((a) => a.bank_name.trim().length > 0)
    setBankAccounts(valid)
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          familyId,
          bankAccounts: valid.map((a) => ({
            bank_name: a.bank_name,
            account_type: a.account_type,
            opening_balance: a.opening_balance ?? 0,
            savings_goals: a.savings_goals ?? [],
            profileIndex: a.profileIndex ?? 0,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success("Bank accounts saved")
      router.push(pathWithMode("/onboarding/telegram", mode))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Accounts</CardTitle>
        <CardDescription>Add your bank accounts to track.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {accounts.map((account, i) => (
          <div key={accountKeys[i]} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Account {i + 1}</p>
              {accounts.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeAccount(i)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              )}
            </div>

            {userCount > 1 && (
              <div className="space-y-1.5">
                <Label>Profile</Label>
                <Select
                  value={String(account.profileIndex)}
                  onValueChange={(v) => updateAccount(i, "profileIndex", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.slice(0, userCount).map((p, idx) => (
                      <SelectItem key={p.name || PROFILE_OPTION_KEYS[idx]} value={String(idx)}>
                        {p.name || `Person ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`bank-name-${i}`}>Bank Name</Label>
                <Input
                  id={`bank-name-${i}`}
                  placeholder="e.g. OCBC"
                  value={account.bank_name}
                  onChange={(e) =>
                    updateAccount(i, "bank_name", e.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor={`account-type-${i}`}>Account Type</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="size-4 cursor-help text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        OCBC 360 accounts get tiered interest based on
                        qualifying activities.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <ButtonSelect
                  value={account.account_type}
                  onValueChange={(v) => updateAccount(i, "account_type", v)}
                  options={ACCOUNT_TYPES.map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`opening-balance-${i}`}>
                Current balance (date auto-logged as today)
              </Label>
              <CurrencyInput
                id={`opening-balance-${i}`}
                placeholder="0.00"
                value={account.opening_balance ?? 0}
                onChange={(v) =>
                  updateAccount(i, "opening_balance", v ?? 0)
                }
              />
            </div>

            {isOcbcAccount(account) && (
              <div className="space-y-3 rounded-md bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showGoals[i] ?? account.savings_goals.length > 0}
                    onCheckedChange={(checked) => toggleGoals(i, checked)}
                  />
                  <Label className="text-sm">
                    Set savings goals for this OCBC account?
                  </Label>
                </div>

                {(showGoals[i] ?? account.savings_goals.length > 0) &&
                  account.savings_goals.map((goal, gi) => (
                    <div
                      key={`account-${i}-goal-${gi}`}
                      className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      <div className="space-y-1">
                        <Label htmlFor={`goal-name-${i}-${gi}`}>
                          Goal Name
                        </Label>
                        <Input
                          id={`goal-name-${i}-${gi}`}
                          placeholder="e.g. Emergency Fund"
                          value={goal.name}
                          onChange={(e) =>
                            updateGoal(i, gi, "name", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`goal-target-${i}-${gi}`}>
                          Target ($)
                        </Label>
                        <CurrencyInput
                          id={`goal-target-${i}-${gi}`}
                          placeholder="e.g. 10,000.00"
                          value={goal.target_amount ?? null}
                          onChange={(v) =>
                            updateGoal(i, gi, "target_amount", v)
                          }
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label htmlFor={`goal-current-${i}-${gi}`}>
                            Current ($)
                          </Label>
                          <CurrencyInput
                            id={`goal-current-${i}-${gi}`}
                            placeholder="0.00"
                            value={goal.current_amount ?? null}
                            onChange={(v) =>
                              updateGoal(i, gi, "current_amount", v)
                            }
                          />
                        </div>
                        {account.savings_goals.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeGoal(i, gi)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`goal-deadline-${i}-${gi}`}>
                          End Date
                        </Label>
                        <DatePicker
                          id={`goal-deadline-${i}-${gi}`}
                          value={goal.deadline ?? null}
                          onChange={(date) =>
                            updateGoal(i, gi, "deadline", date ?? "")
                          }
                          placeholder="Select end date"
                        />
                      </div>
                    </div>
                  ))}

                {(showGoals[i] ?? account.savings_goals.length > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addGoal(i)}
                  >
                    <Plus data-icon="inline-start" />
                    Add another goal
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}

        <Button variant="outline" onClick={addAccount}>
          <Plus data-icon="inline-start" />
          Add another bank
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/cpf", mode))}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={isLoading}>
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="link"
            className="ml-auto text-muted-foreground"
            onClick={skipOnboarding}
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
