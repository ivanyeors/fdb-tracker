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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useOnboarding,
  type BankAccount,
  type SavingsGoal,
} from "@/components/onboarding/onboarding-provider"
import {
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Plus,
  Trash2,
} from "lucide-react"

const ACCOUNT_TYPES = [
  { value: "ocbc_360", label: "OCBC 360" },
  { value: "basic", label: "Basic Savings" },
  { value: "savings", label: "Savings" },
  { value: "fixed_deposit", label: "Fixed Deposit" },
] as const

function isOcbcAccount(account: BankAccount) {
  return (
    account.account_type === "ocbc_360" ||
    account.bank_name.toUpperCase().includes("OCBC")
  )
}

export default function BanksPage() {
  const router = useRouter()
  const { bankAccounts, setBankAccounts } = useOnboarding()
  const [accounts, setAccounts] = useState<BankAccount[]>(
    bankAccounts.length > 0
      ? bankAccounts
      : [{ bank_name: "", account_type: "savings", savings_goals: [] }],
  )
  const [showGoals, setShowGoals] = useState<Record<number, boolean>>({})

  function updateAccount(
    index: number,
    field: keyof BankAccount,
    value: string,
  ) {
    const updated = [...accounts]
    if (field === "account_type") {
      updated[index] = {
        ...updated[index],
        account_type: value as BankAccount["account_type"],
      }
    } else if (field === "bank_name") {
      updated[index] = { ...updated[index], bank_name: value }
    }
    setAccounts(updated)
  }

  function addAccount() {
    setAccounts([
      ...accounts,
      { bank_name: "", account_type: "savings", savings_goals: [] },
    ])
  }

  function removeAccount(index: number) {
    setAccounts(accounts.filter((_, i) => i !== index))
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
        savings_goals: [{ name: "", target_amount: null, current_amount: 0 }],
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
    value: string,
  ) {
    const updated = [...accounts]
    const goals = [...updated[accountIdx].savings_goals]
    if (field === "name") {
      goals[goalIdx] = { ...goals[goalIdx], name: value }
    } else {
      goals[goalIdx] = {
        ...goals[goalIdx],
        [field]: value === "" ? (field === "current_amount" ? 0 : null) : Number(value),
      }
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
        { name: "", target_amount: null, current_amount: 0 },
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

  function handleNext() {
    const valid = accounts.filter((a) => a.bank_name.trim().length > 0)
    setBankAccounts(valid)
    router.push("/onboarding/telegram")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Accounts</CardTitle>
        <CardDescription>Add your bank accounts to track.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {accounts.map((account, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
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
                <Select
                  value={account.account_type}
                  onValueChange={(v) => updateAccount(i, "account_type", v)}
                >
                  <SelectTrigger id={`account-type-${i}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                      key={gi}
                      className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-3"
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
                        <Input
                          id={`goal-target-${i}-${gi}`}
                          type="number"
                          placeholder="e.g. 10000"
                          value={goal.target_amount ?? ""}
                          onChange={(e) =>
                            updateGoal(i, gi, "target_amount", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label htmlFor={`goal-current-${i}-${gi}`}>
                            Current ($)
                          </Label>
                          <Input
                            id={`goal-current-${i}-${gi}`}
                            type="number"
                            placeholder="0"
                            value={goal.current_amount || ""}
                            onChange={(e) =>
                              updateGoal(
                                i,
                                gi,
                                "current_amount",
                                e.target.value,
                              )
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

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/onboarding/income")}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={handleNext}>
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
