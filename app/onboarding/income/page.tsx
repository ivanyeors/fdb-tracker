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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useOnboarding,
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
  const { profiles, userCount, incomeConfigs, setIncomeConfigs } =
    useOnboarding()
  const [errors, setErrors] = useState<Record<string, string>>({})

  function updateIncome(
    index: number,
    field: keyof IncomeConfig,
    value: string,
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
        [field]: value === "" ? null : Number(value),
      }
    }
    setIncomeConfigs(updated)
  }

  function handleNext() {
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
    router.push("/onboarding/banks")
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
                <Input
                  id={`salary-${i}`}
                  type="number"
                  placeholder="e.g. 60000"
                  value={config.annual_salary ?? ""}
                  onChange={(e) =>
                    updateIncome(i, "annual_salary", e.target.value)
                  }
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
                <Input
                  id={`bonus-${i}`}
                  type="number"
                  placeholder="e.g. 5000"
                  value={config.bonus_estimate ?? ""}
                  onChange={(e) =>
                    updateIncome(i, "bonus_estimate", e.target.value)
                  }
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

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/onboarding/profiles")}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={handleNext}>
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="link"
            className="ml-auto"
            onClick={() => router.push("/onboarding/banks")}
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
