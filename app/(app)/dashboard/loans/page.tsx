"use client"

import { useState, useEffect, useMemo } from "react"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { formatCurrency } from "@/lib/utils"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

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

type HousingData = {
  oaUsed: number
  accruedInterest: number
  refundDue: number
  vlRemaining: number
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
  const [housingData, setHousingData] = useState<HousingData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!activeProfileId && !activeFamilyId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (activeProfileId) params.set("profileId", activeProfileId)
        else if (activeFamilyId) params.set("familyId", activeFamilyId)
        const qs = params.toString()

        const [loansRes, housingRes] = await Promise.all([
          fetch(`/api/loans?${qs}`),
          fetch(`/api/cpf/housing?${qs}`),
        ])

        if (loansRes.ok) {
          const json = await loansRes.json()
          setLoans(json ?? [])
        }
        if (housingRes.ok) {
          const json = await housingRes.json()
          setHousingData(json)
        }
      } catch (error) {
        console.error("Failed to fetch loans:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [activeProfileId, activeFamilyId])

  const totalPrincipal = useMemo(() => loans.reduce((sum, l) => sum + l.principal, 0), [loans])
  const totalMonthly = useMemo(
    () => loans.reduce((sum, l) => sum + calculateMonthlyPayment(l.principal, l.rate_pct, l.tenure_months), 0),
    [loans],
  )

  const hasCpfLoans = useMemo(() => loans.some((l) => l.use_cpf_oa), [loans])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Loans"
        description="Loan tracking, repayments, and interest overview."
      />

      {isLoading ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          <div className="rounded-xl border overflow-hidden">
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </>
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

          {hasCpfLoans && (
            <div className="space-y-4">
              <SectionHeader
                title="CPF Housing"
                description="CPF OA used for housing and refund due on sale."
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetricCard
                  label="CPF OA Used"
                  value={housingData?.oaUsed ?? 0}
                  prefix="$"
                  tooltipId="CPF_HOUSING_REFUND"
                />
                <MetricCard
                  label="Accrued Interest"
                  value={housingData?.accruedInterest ?? 0}
                  prefix="$"
                  tooltipId="CPF_HOUSING_REFUND"
                />
                <MetricCard
                  label="Total Refund Due"
                  value={housingData?.refundDue ?? 0}
                  prefix="$"
                  tooltipId="CPF_HOUSING_REFUND"
                />
                <MetricCard
                  label="120% VL Remaining"
                  value={housingData?.vlRemaining ?? 0}
                  prefix="$"
                  tooltipId="CPF_HOUSING_REFUND"
                />
              </div>
            </div>
          )}

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
