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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ButtonSelect } from "@/components/ui/button-select"
import {
  useOnboarding,
  pathWithMode,
  type OnboardingTaxRelief,
} from "@/components/onboarding/onboarding-provider"
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

const RELIEF_TYPES = [
  { value: "srs", label: "SRS Contribution" },
  { value: "donations", label: "Donations (IPC)" },
  { value: "course_fees", label: "Course Fees" },
  { value: "cpf_topup_self", label: "CPF Top-up (Self)" },
  { value: "cpf_topup_family", label: "CPF Top-up (Family)" },
  { value: "other", label: "Other" },
] as const

export default function TaxReliefsPage() {
  const router = useRouter()
  const { mode, profiles, userCount, taxReliefInputs, setTaxReliefInputs, familyId, skipOnboarding } =
    useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<OnboardingTaxRelief[]>(
    taxReliefInputs.length > 0 ? taxReliefInputs : [],
  )
  const [itemKeys, setItemKeys] = useState<string[]>(() =>
    Array.from({ length: taxReliefInputs.length }, () => crypto.randomUUID()),
  )

  function addItem() {
    setItems([
      ...items,
      {
        relief_type: "srs",
        amount: 0,
        profileIndex: 0,
      },
    ])
    setItemKeys([...itemKeys, crypto.randomUUID()])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
    setItemKeys(itemKeys.filter((_, i) => i !== index))
  }

  function updateItem(
    index: number,
    field: keyof OnboardingTaxRelief,
    value: string | number,
  ) {
    const updated = [...items]
    if (field === "relief_type")
      updated[index] = { ...updated[index], relief_type: value as string }
    else if (field === "amount")
      updated[index] = {
        ...updated[index],
        amount: typeof value === "number" ? value : Number(value) || 0,
      }
    else if (field === "profileIndex")
      updated[index] = {
        ...updated[index],
        profileIndex: typeof value === "number" ? value : Number(value) || 0,
      }
    setItems(updated)
  }

  async function saveAndNavigate(reliefList: OnboardingTaxRelief[]) {
    setTaxReliefInputs(reliefList)
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/tax-reliefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, familyId, taxReliefInputs: reliefList }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success(
        reliefList.length > 0 ? "Tax reliefs saved" : "Tax reliefs skipped",
      )
      router.push(pathWithMode("/onboarding/complete", mode))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function handleNext() {
    const valid = items.filter((i) => i.amount > 0)
    saveAndNavigate(valid)
  }

  function handleSkip() {
    saveAndNavigate([])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Reliefs (Optional)</CardTitle>
        <CardDescription>
          Add manual tax relief inputs for the current year.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.map((item, i) => (
          <div key={itemKeys[i]} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Relief {i + 1}</p>
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
                      <SelectItem key={`profile-opt-${p.name || idx}`} value={String(idx)}>
                        {p.name || `Person ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relief Type</Label>
                <ButtonSelect
                  value={item.relief_type}
                  onValueChange={(v) => updateItem(i, "relief_type", v)}
                  options={RELIEF_TYPES.map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount ($)</Label>
                <CurrencyInput
                  placeholder="0.00"
                  value={item.amount}
                  onChange={(v) => updateItem(i, "amount", v ?? 0)}
                />
              </div>
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addItem}>
          <Plus data-icon="inline-start" />
          Add relief
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() =>
              router.push(pathWithMode("/onboarding/insurance", mode))
            }
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
