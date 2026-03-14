"use client"

import { useState, useEffect, useMemo } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { formatCurrency } from "@/lib/utils"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Badge } from "@/components/ui/badge"

interface Loan {
  id: string
  name: string
  type: string
  principal: number
  rate_pct: number
  tenure_months: number
  start_date: string
  lender: string | null
  use_cpf_oa: boolean
  created_at: string
}

function calculateMonthlyPayment(principal: number, annualRate: number, tenureMonths: number) {
  if (annualRate === 0) return principal / tenureMonths
  const r = annualRate / 100 / 12
  return (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1)
}

function getRemainingMonths(startDate: string, tenureMonths: number): number {
  const start = new Date(startDate)
  const end = new Date(start)
  end.setMonth(end.getMonth() + tenureMonths)
  const now = new Date()
  const diff = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
  return Math.max(0, diff)
}

export default function LoansPage() {
  const { activeProfileId, activeFamilyId } = useActiveProfile()
  const [loans, setLoans] = useState<Loan[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchLoans() {
      if (!activeProfileId && !activeFamilyId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const url = new URL("/api/loans", window.location.origin)
        if (activeProfileId) url.searchParams.set("profileId", activeProfileId)
        else if (activeFamilyId) url.searchParams.set("familyId", activeFamilyId)

        const res = await fetch(url)
        if (res.ok) {
          const json = await res.json()
          setLoans(json)
        }
      } catch (error) {
        console.error("Failed to fetch loans:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchLoans()
  }, [activeProfileId, activeFamilyId])

  const totalPrincipal = useMemo(() => loans.reduce((sum, l) => sum + l.principal, 0), [loans])
  const totalMonthly = useMemo(
    () => loans.reduce((sum, l) => sum + calculateMonthlyPayment(l.principal, l.rate_pct, l.tenure_months), 0),
    [loans],
  )

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Loans"
        description="Loan tracking, repayments, and interest overview."
      />

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          Loading loans...
        </div>
      ) : loans.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No loans found for this profile.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Total Principal"
              value={totalPrincipal}
              prefix="$"
            />
            <MetricCard
              label="Est. Monthly Repayment"
              value={totalMonthly}
              prefix="$"
            />
            <MetricCard
              label="Active Loans"
              value={`${loans.length}`}
            />
          </div>

          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Loan</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Principal</th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-4 py-3 text-right font-medium">Monthly</th>
                    <th className="px-4 py-3 text-right font-medium">Remaining</th>
                    <th className="px-4 py-3 text-center font-medium">CPF OA</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => {
                    const monthly = calculateMonthlyPayment(loan.principal, loan.rate_pct, loan.tenure_months)
                    const remaining = getRemainingMonths(loan.start_date, loan.tenure_months)
                    const years = Math.floor(remaining / 12)
                    const months = remaining % 12

                    return (
                      <tr key={loan.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{loan.name}</div>
                          {loan.lender && (
                            <div className="text-xs text-muted-foreground">{loan.lender}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {loan.type}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ${formatCurrency(loan.principal)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {loan.rate_pct}%
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ${formatCurrency(monthly)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {remaining === 0 ? (
                            <Badge variant="default" className="bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400">
                              Paid off
                            </Badge>
                          ) : (
                            `${years > 0 ? `${years}y ` : ""}${months}m`
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {loan.use_cpf_oa ? "✓" : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
