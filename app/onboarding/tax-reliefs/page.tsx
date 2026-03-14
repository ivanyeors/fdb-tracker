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
import {
  useOnboarding,
  pathWithMode,
  type OnboardingTaxRelief,
} from "@/components/onboarding/onboarding-provider"
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react"

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
  const { mode, profiles, userCount, taxReliefInputs, setTaxReliefInputs } =
    useOnboarding()
  const [items, setItems] = useState<OnboardingTaxRelief[]>(
    taxReliefInputs.length > 0 ? taxReliefInputs : [],
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
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
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

  function handleNext() {
    const valid = items.filter((i) => i.amount > 0)
    setTaxReliefInputs(valid)
    router.push(pathWithMode("/onboarding/complete", mode))
  }

  function handleSkip() {
    setTaxReliefInputs([])
    router.push(pathWithMode("/onboarding/complete", mode))
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
          <div key={i} className="space-y-3 rounded-lg border p-4">
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
                      <SelectItem key={idx} value={String(idx)}>
                        {p.name || `Person ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relief Type</Label>
                <Select
                  value={item.relief_type}
                  onValueChange={(v) => updateItem(i, "relief_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELIEF_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() =>
              router.push(pathWithMode("/onboarding/insurance", mode))
            }
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button variant="outline" onClick={handleSkip}>
            Skip
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
