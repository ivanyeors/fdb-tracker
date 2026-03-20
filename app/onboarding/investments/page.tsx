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
import {
  useOnboarding,
  pathWithMode,
  type OnboardingInvestment,
} from "@/components/onboarding/onboarding-provider"
import { SymbolPickerDrawer } from "@/components/dashboard/investments/symbol-picker-drawer"
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

const INVESTMENT_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "ilp", label: "ILP" },
  { value: "bond", label: "Bond" },
] as const

export default function InvestmentsPage() {
  const router = useRouter()
  const { mode, profiles, userCount, investments, setInvestments, familyId, skipOnboarding } = useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<OnboardingInvestment[]>(
    investments.length > 0 ? investments : [],
  )
  const [symbolDrawerIndex, setSymbolDrawerIndex] = useState<number | null>(null)

  function addItem() {
    setItems([
      ...items,
      {
        type: "stock",
        symbol: "",
        units: 0,
        cost_basis: 0,
        profileIndex: 0,
      },
    ])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(
    index: number,
    field: keyof OnboardingInvestment,
    value: string | number,
  ) {
    const updated = [...items]
    if (field === "type") {
      const newType = value as OnboardingInvestment["type"]
      updated[index] = {
        ...updated[index],
        type: newType,
        symbol: newType === "gold" ? "Gold" : newType === "silver" ? "Silver" : updated[index].symbol,
      }
    } else if (field === "symbol") {
      updated[index] = { ...updated[index], symbol: value as string }
    } else if (field === "units") {
      updated[index] = {
        ...updated[index],
        units: typeof value === "number" ? value : Number(value) || 0,
      }
    } else if (field === "cost_basis") {
      updated[index] = {
        ...updated[index],
        cost_basis: typeof value === "number" ? value : Number(value) || 0,
      }
    } else if (field === "profileIndex") {
      updated[index] = {
        ...updated[index],
        profileIndex: typeof value === "number" ? value : Number(value) || 0,
      }
    }
    setItems(updated)
  }

  async function handleNext() {
    const valid = items.filter((i) => i.symbol.trim().length > 0 && i.units > 0)
    setInvestments(valid)
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, familyId, investments: valid }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success("Investments saved")
      router.push(pathWithMode("/onboarding/loans", mode))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSkip() {
    setInvestments([])
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, familyId, investments: [] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success("Investments skipped")
      router.push(pathWithMode("/onboarding/loans", mode))
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
        <CardTitle>Investments (Optional)</CardTitle>
        <CardDescription>
          Add your investment holdings to track portfolio value and P&L.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.map((item, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Holding {i + 1}</p>
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
                    {INVESTMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Symbol / Name</Label>
                {(item.type === "gold" || item.type === "silver") ? (
                  <Input
                    value={item.type === "gold" ? "Gold" : "Silver"}
                    disabled
                    className="bg-muted"
                  />
                ) : item.symbol ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-3 py-2 text-sm font-medium">
                      {item.symbol}
                      <button
                        type="button"
                        onClick={() => updateItem(i, "symbol", "")}
                        className="rounded p-0.5 hover:bg-muted-foreground/20"
                        aria-label="Clear symbol"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSymbolDrawerIndex(i)}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => setSymbolDrawerIndex(i)}
                  >
                    <Plus className="mr-2 size-4" />
                    Add symbol
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Units</Label>
                <CurrencyInput
                  placeholder="0"
                  value={item.units}
                  onChange={(v) => updateItem(i, "units", v ?? 0)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Cost per unit ($)</Label>
                <CurrencyInput
                  placeholder="0.00"
                  value={item.cost_basis}
                  onChange={(v) => updateItem(i, "cost_basis", v ?? 0)}
                />
              </div>
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addItem}>
          <Plus data-icon="inline-start" />
          Add holding
        </Button>

        <SymbolPickerDrawer
          open={symbolDrawerIndex !== null}
          onOpenChange={(open) => !open && setSymbolDrawerIndex(null)}
          onSelect={(s) => {
            if (symbolDrawerIndex !== null) {
              updateItem(symbolDrawerIndex, "symbol", s)
              setSymbolDrawerIndex(null)
            }
          }}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/reminders", mode))}
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
