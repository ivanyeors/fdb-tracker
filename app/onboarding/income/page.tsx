"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useOnboarding,
  pathWithMode,
  type IncomeConfig,
} from "@/components/onboarding/onboarding-provider"
import { incomeSchema } from "@/lib/validations/onboarding"
import { ArrowLeft, ArrowRight, HelpCircle } from "lucide-react"

const PAY_FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "bi-monthly", label: "Bi-Monthly" },
  { value: "weekly", label: "Weekly" },
] as const

export default function IncomePage() {
  const router = useRouter()
  const { mode, profiles, userCount, incomeConfigs, setIncomeConfigs, familyId, skipOnboarding } =
    useOnboarding()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateIncome(
    index: number,
    field: keyof IncomeConfig,
    value: string | number | null,
  ) {
    const updated = [...incomeConfigs]
    if (field === "pay_frequency") {
      updated[index] = {
        ...updated[index],
        pay_frequency: value as IncomeConfig["pay_frequency"],
      }
    } else {
      updated[index] = {
        ...updated[index],
        [field]:
          value === null || value === undefined || value === ""
            ? null
            : typeof value === "number"
              ? value
              : Number(value),
      }
    }
    setIncomeConfigs(updated)
  }

  async function handleNext() {
    const fieldErrors: Record<string, string> = {}
    const configs = incomeConfigs.slice(0, userCount)

    for (let i = 0; i < configs.length; i++) {
      const c = configs[i]
      const result = incomeSchema.safeParse({
        annual_salary: c.annual_salary ?? 0,
        bonus_estimate: c.bonus_estimate ?? 0,
        pay_frequency: c.pay_frequency,
      })
      if (!result.success) {
        for (const issue of result.error.issues) {
          fieldErrors[`${i}.${String(issue.path[0])}`] = issue.message
        }
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          familyId,
          incomeConfigs: configs.map((c) => ({
            annual_salary: c.annual_salary ?? 0,
            bonus_estimate: c.bonus_estimate ?? 0,
            pay_frequency: c.pay_frequency,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      router.push(pathWithMode("/onboarding/cpf", mode))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSkip() {
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          familyId,
          incomeConfigs: incomeConfigs.slice(0, userCount).map(() => ({
            annual_salary: 0,
            bonus_estimate: 0,
            pay_frequency: "monthly",
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      router.push(pathWithMode("/onboarding/cpf", mode))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income details</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          Enter income info for each profile.
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Income drives CPF projection. Net pay = gross − employee CPF
                contribution.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {incomeConfigs.slice(0, userCount).map((config, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">
              {profiles[i]?.name || `Person ${i + 1}`}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`salary-${i}`}>Annual Salary ($)</Label>
                <CurrencyInput
                  id={`salary-${i}`}
                  placeholder="e.g. 60,000.00"
                  value={config.annual_salary ?? null}
                  onChange={(v) => updateIncome(i, "annual_salary", v)}
                  aria-invalid={!!errors[`${i}.annual_salary`]}
                />
                {errors[`${i}.annual_salary`] && (
                  <p className="text-xs text-destructive">
                    {errors[`${i}.annual_salary`]}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`bonus-${i}`}>Bonus Estimate ($)</Label>
                <CurrencyInput
                  id={`bonus-${i}`}
                  placeholder="e.g. 5,000.00"
                  value={config.bonus_estimate ?? null}
                  onChange={(v) => updateIncome(i, "bonus_estimate", v)}
                  aria-invalid={!!errors[`${i}.bonus_estimate`]}
                />
                {errors[`${i}.bonus_estimate`] && (
                  <p className="text-xs text-destructive">
                    {errors[`${i}.bonus_estimate`]}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`freq-${i}`}>Pay Frequency</Label>
              <Select
                value={config.pay_frequency}
                onValueChange={(v) => updateIncome(i, "pay_frequency", v)}
              >
                <SelectTrigger id={`freq-${i}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAY_FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/profiles", mode))}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={isLoading}>
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button variant="link" className="text-muted-foreground" onClick={handleSkip} disabled={isLoading}>
            Skip for now
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
