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
import { DatePicker } from "@/components/ui/date-picker"
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
  type OnboardingInsurance,
} from "@/components/onboarding/onboarding-provider"
import { getFieldsForInsurancePolicyRow } from "@/lib/insurance/coverage-config"
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

const INSURANCE_TYPES = [
  { value: "term_life", label: "Term Life" },
  { value: "whole_life", label: "Whole Life" },
  { value: "integrated_shield", label: "Integrated Shield" },
  { value: "critical_illness", label: "Critical Illness" },
  { value: "endowment", label: "Endowment" },
  { value: "personal_accident", label: "Personal Accident" },
] as const

export default function InsurancePage() {
  const router = useRouter()
  const { mode, profiles, userCount, insurancePolicies, setInsurancePolicies, familyId, skipOnboarding } =
    useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<OnboardingInsurance[]>(
    insurancePolicies.length > 0 ? insurancePolicies : [],
  )

  function addItem() {
    setItems([
      ...items,
      {
        name: "",
        type: "term_life",
        premium_amount: 0,
        frequency: "yearly",
        profileIndex: 0,
      },
    ])
  }

  function updateItemWithTypeReset(index: number, type: string) {
    const fields = getFieldsForInsurancePolicyRow(type, items[index].frequency)
    const updated = [...items]
    updated[index] = {
      ...updated[index],
      type,
      current_amount: fields.showCurrentAmount ? updated[index].current_amount : null,
      end_date: fields.showEndDate ? updated[index].end_date : null,
    }
    setItems(updated)
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(
    index: number,
    field: keyof OnboardingInsurance,
    value: string | number | null,
  ) {
    const updated = [...items]
    if (field === "name") updated[index] = { ...updated[index], name: value as string }
    else if (field === "type")
      updated[index] = { ...updated[index], type: value as string }
    else if (field === "premium_amount")
      updated[index] = {
        ...updated[index],
        premium_amount: typeof value === "number" ? value : Number(value) || 0,
      }
    else if (field === "frequency")
      updated[index] = {
        ...updated[index],
        frequency: value as "monthly" | "yearly",
      }
    else if (field === "coverage_amount")
      updated[index] = {
        ...updated[index],
        coverage_amount: typeof value === "number" ? value : Number(value) || 0,
      }
    else if (field === "yearly_outflow_date")
      updated[index] = {
        ...updated[index],
        yearly_outflow_date: typeof value === "number" ? value : Number(value) || null,
      }
    else if (field === "current_amount")
      updated[index] = {
        ...updated[index],
        current_amount: typeof value === "number" ? value : Number(value) || null,
      }
    else if (field === "end_date")
      updated[index] = {
        ...updated[index],
        end_date: typeof value === "string" ? value || null : null,
      }
    else if (field === "inception_date")
      updated[index] = {
        ...updated[index],
        inception_date: typeof value === "string" ? value || null : null,
      }
    else if (field === "cpf_premium")
      updated[index] = {
        ...updated[index],
        cpf_premium: typeof value === "number" ? value : Number(value) || null,
      }
    else if (field === "profileIndex")
      updated[index] = {
        ...updated[index],
        profileIndex: typeof value === "number" ? value : Number(value) || 0,
      }
    setItems(updated)
  }

  async function saveAndNavigate(policyList: OnboardingInsurance[]) {
    setInsurancePolicies(policyList)
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/insurance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, familyId, insurancePolicies: policyList }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success(
        policyList.length > 0 ? "Insurance saved" : "Insurance skipped",
      )
      router.push(pathWithMode("/onboarding/tax-reliefs", mode))
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
      (i) => i.name.trim().length > 0 && i.premium_amount > 0,
    )
    saveAndNavigate(valid)
  }

  function handleSkip() {
    saveAndNavigate([])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insurance (Optional)</CardTitle>
        <CardDescription>
          Add your insurance policies for coverage tracking and outflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.map((item, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Policy {i + 1}</p>
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
                  onValueChange={(v) => updateItemWithTypeReset(i, v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSURANCE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Policy Name</Label>
                <Input
                  placeholder="e.g. Term Life 500k"
                  value={item.name}
                  onChange={(e) => updateItem(i, "name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Premium ($)</Label>
                <CurrencyInput
                  placeholder="0.00"
                  value={item.premium_amount}
                  onChange={(v) => updateItem(i, "premium_amount", v ?? 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select
                  value={item.frequency}
                  onValueChange={(v) =>
                    updateItem(i, "frequency", v as "monthly" | "yearly")
                  }
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
              {(() => {
                const fields = getFieldsForInsurancePolicyRow(item.type, item.frequency)
                return (
                  <>
                    {fields.showCoverageAmount && (
                      <div className="space-y-1.5">
                        <Label>{fields.coverageAmountLabel} ($, optional)</Label>
                        <CurrencyInput
                          placeholder="0.00"
                          value={item.coverage_amount ?? null}
                          onChange={(v) => updateItem(i, "coverage_amount", v ?? 0)}
                        />
                      </div>
                    )}
                    {fields.showYearlyOutflowDate && (
                      <div className="space-y-1.5">
                        <Label>Yearly due month</Label>
                        <Select
                          value={item.yearly_outflow_date?.toString()}
                          onValueChange={(v) =>
                            updateItem(i, "yearly_outflow_date", v ? parseInt(v, 10) : null)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Month" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, m) => m + 1).map((m) => (
                              <SelectItem key={m} value={String(m)}>
                                {new Date(2000, m - 1).toLocaleString("en", { month: "long" })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {fields.showCurrentAmount && (
                      <div className="space-y-1.5">
                        <Label>{fields.currentAmountLabel} ($, optional)</Label>
                        <CurrencyInput
                          placeholder="0.00"
                          value={item.current_amount ?? null}
                          onChange={(v) => updateItem(i, "current_amount", v ?? 0)}
                        />
                      </div>
                    )}
                    {fields.showEndDate && (
                      <div className="space-y-1.5">
                        <Label>{fields.endDateLabel}</Label>
                        <DatePicker
                          value={item.end_date ?? null}
                          onChange={(d) => updateItem(i, "end_date", d ?? "")}
                          placeholder="Select date"
                          className="w-full"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Inception date (optional)</Label>
                      <DatePicker
                        value={item.inception_date ?? null}
                        onChange={(d) => updateItem(i, "inception_date", d ?? "")}
                        placeholder="Policy start date"
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CPF premium (annual, optional)</Label>
                      <CurrencyInput
                        placeholder="0.00"
                        value={item.cpf_premium ?? null}
                        onChange={(v) => updateItem(i, "cpf_premium", v ?? 0)}
                      />
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addItem}>
          <Plus data-icon="inline-start" />
          Add policy
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/loans", mode))}
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
