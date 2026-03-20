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
import { Switch } from "@/components/ui/switch"
import { DatePicker } from "@/components/ui/date-picker"
import {
  useOnboarding,
  pathWithMode,
  type OnboardingLoan,
} from "@/components/onboarding/onboarding-provider"
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

const LOAN_TYPES = [
  { value: "housing", label: "Housing" },
  { value: "personal", label: "Personal" },
  { value: "car", label: "Car" },
  { value: "education", label: "Education" },
] as const

export default function LoansPage() {
  const router = useRouter()
  const { mode, profiles, userCount, loans, setLoans, familyId, skipOnboarding } = useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<OnboardingLoan[]>(
    loans.length > 0 ? loans : [],
  )

  function addItem() {
    const today = new Date().toISOString().slice(0, 10)
    setItems([
      ...items,
      {
        name: "",
        type: "housing",
        principal: 0,
        rate_pct: 0,
        tenure_months: 0,
        start_date: today,
        use_cpf_oa: false,
        profileIndex: 0,
      },
    ])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(
    index: number,
    field: keyof OnboardingLoan,
    value: string | number | boolean,
  ) {
    const updated = [...items]
    if (field === "name") updated[index] = { ...updated[index], name: value as string }
    else if (field === "type")
      updated[index] = { ...updated[index], type: value as OnboardingLoan["type"] }
    else if (field === "principal")
      updated[index] = {
        ...updated[index],
        principal: typeof value === "number" ? value : Number(value) || 0,
      }
    else if (field === "rate_pct")
      updated[index] = {
        ...updated[index],
        rate_pct: typeof value === "number" ? value : Number(value) || 0,
      }
    else if (field === "tenure_months")
      updated[index] = {
        ...updated[index],
        tenure_months: typeof value === "number" ? value : Number(value) || 0,
      }
    else if (field === "start_date")
      updated[index] = { ...updated[index], start_date: value as string }
    else if (field === "lender")
      updated[index] = { ...updated[index], lender: value as string }
    else if (field === "use_cpf_oa")
      updated[index] = { ...updated[index], use_cpf_oa: value as boolean }
    else if (field === "profileIndex")
      updated[index] = {
        ...updated[index],
        profileIndex: typeof value === "number" ? value : Number(value) || 0,
      }
    setItems(updated)
  }

  async function saveAndNavigate(loanList: OnboardingLoan[]) {
    setLoans(loanList)
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, familyId, loans: loanList }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success(
        loanList.length > 0 ? "Loans saved" : "Loans skipped",
      )
      router.push(pathWithMode("/onboarding/insurance", mode))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function handleNext() {
    const valid = items.filter(
      (i) => i.name.trim().length > 0 && i.principal > 0 && i.tenure_months > 0,
    )
    saveAndNavigate(valid)
  }

  function handleSkip() {
    saveAndNavigate([])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loans (Optional)</CardTitle>
        <CardDescription>
          Add your loans for repayment tracking and cashflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.map((item, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Loan {i + 1}</p>
              <Button variant="ghost" size="icon-xs" onClick={() => removeItem(i)}>
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Profile</Label>
                <Select
                  value={String(item.profileIndex)}
                  onValueChange={(v) => updateItem(i, "profileIndex", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.slice(0, userCount).map((p, idx) => (
                      <SelectItem key={idx} value={String(idx)}>
                        {p.name || `Person ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={item.type}
                  onValueChange={(v) => updateItem(i, "type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. HDB Loan"
                  value={item.name}
                  onChange={(e) => updateItem(i, "name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Principal ($)</Label>
                <CurrencyInput
                  placeholder="0.00"
                  value={item.principal}
                  onChange={(v) => updateItem(i, "principal", v ?? 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rate (% p.a.)</Label>
                <CurrencyInput
                  placeholder="2.5"
                  value={item.rate_pct}
                  onChange={(v) => updateItem(i, "rate_pct", v ?? 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tenure (months)</Label>
                <Input
                  type="number"
                  placeholder="240"
                  value={item.tenure_months || ""}
                  onChange={(e) =>
                    updateItem(i, "tenure_months", parseInt(e.target.value, 10) || 0)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <DatePicker
                  value={item.start_date || null}
                  onChange={(d) => updateItem(i, "start_date", d ?? "")}
                  placeholder="Select date"
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  checked={item.use_cpf_oa}
                  onCheckedChange={(c) => updateItem(i, "use_cpf_oa", c)}
                />
                <Label>Uses CPF OA</Label>
              </div>
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addItem}>
          <Plus data-icon="inline-start" />
          Add loan
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/investments", mode))}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button variant="outline" onClick={handleSkip} disabled={isLoading}>
            Skip
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
            Skip setup
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
