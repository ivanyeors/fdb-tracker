"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useOnboarding,
  pathWithMode,
  type CpfBalance,
} from "@/components/onboarding/onboarding-provider"
import { ArrowLeft, ArrowRight, HelpCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function CpfPage() {
  const router = useRouter()
  const { mode, profiles, userCount, cpfBalances, setCpfBalances, familyId, skipOnboarding } = useOnboarding()
  const [balances, setBalances] = useState<CpfBalance[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cpfBalances.length > 0) {
      setBalances(cpfBalances)
    } else {
      setBalances(
        Array.from({ length: userCount }, (_, i) => ({
          profileIndex: i,
          oa: 0,
          sa: 0,
          ma: 0,
        })),
      )
    }
  }, [userCount, cpfBalances])

  useEffect(() => {
    if (balances.length !== userCount) {
      setBalances((prev) => {
        const next: CpfBalance[] = []
        for (let i = 0; i < userCount; i++) {
          const existing = prev.find((b) => b.profileIndex === i)
          next.push(
            existing ?? { profileIndex: i, oa: 0, sa: 0, ma: 0 },
          )
        }
        return next
      })
    }
  }, [userCount, balances.length])

  function updateBalance(
    profileIndex: number,
    field: "oa" | "sa" | "ma",
    value: number | null,
  ) {
    const num = value ?? 0
    setBalances((prev) => {
      const idx = prev.findIndex((b) => b.profileIndex === profileIndex)
      const copy = [...prev]
      if (idx >= 0) {
        copy[idx] = { ...copy[idx], [field]: num }
      } else {
        copy.push({
          profileIndex,
          oa: field === "oa" ? num : 0,
          sa: field === "sa" ? num : 0,
          ma: field === "ma" ? num : 0,
        })
      }
      return copy
    })
  }

  async function handleNext() {
    setCpfBalances(balances)
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/cpf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, familyId, cpfBalances: balances }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success("CPF balances saved")
      router.push(pathWithMode("/onboarding/banks", mode))
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
        <CardTitle>CPF Balances</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          Enter current CPF balances for each profile (OA, SA, MA).
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                OA = Ordinary Account, SA = Special Account, MA = Medisave
                Account. These are used for CPF projections and retirement
                tracking.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: userCount }, (_, i) => {
          const bal = balances.find((b) => b.profileIndex === i) ?? {
            profileIndex: i,
            oa: 0,
            sa: 0,
            ma: 0,
          }
          return (
            <div key={`cpf-profile-${i}`} className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">
                {profiles[i]?.name || `Person ${i + 1}`}
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`oa-${i}`}>Ordinary Account (OA)</Label>
                  <CurrencyInput
                    id={`oa-${i}`}
                    placeholder="0.00"
                    value={bal.oa}
                    onChange={(v) => updateBalance(i, "oa", v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`sa-${i}`}>Special Account (SA)</Label>
                  <CurrencyInput
                    id={`sa-${i}`}
                    placeholder="0.00"
                    value={bal.sa}
                    onChange={(v) => updateBalance(i, "sa", v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ma-${i}`}>Medisave Account (MA)</Label>
                  <CurrencyInput
                    id={`ma-${i}`}
                    placeholder="0.00"
                    value={bal.ma}
                    onChange={(v) => updateBalance(i, "ma", v)}
                  />
                </div>
              </div>
            </div>
          )
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/income", mode))}
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
