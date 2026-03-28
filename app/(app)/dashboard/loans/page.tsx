"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { SectionHeader } from "@/components/dashboard/section-header"
import { MetricCard } from "@/components/dashboard/metric-card"
import { formatCurrency } from "@/lib/utils"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Receipt, Pencil, Trash2 } from "lucide-react"
import {
  effectiveRate,
  estimateOutstandingPrincipal,
  loanMonthlyPayment,
  prepaymentSavingsEstimate,
  splitLoanAmount,
} from "@/lib/calculations/loans"
import {
  LoanFormSheet,
  type LoanFormData,
} from "@/components/dashboard/loans/loan-form-sheet"
import { RepaymentFormSheet } from "@/components/dashboard/loans/repayment-form-sheet"
import { DeleteLoanDialog } from "@/components/dashboard/loans/delete-loan-dialog"

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
  valuation_limit?: number | null
  profile_id: string
  split_profile_id?: string | null
  split_pct?: number | null
  rate_increase_pct?: number | null
  property_type?: string | null
  lock_in_end_date?: string | null
  early_repayment_penalty_pct?: number | null
  max_annual_prepayment_pct?: number | null
  created_at: string
}

type HousingData = {
  oaUsed: number
  accruedInterest: number
  refundDue: number
  vlRemaining: number | null
}

type RepaymentRow = { loan_id: string; amount: number; date: string }

function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  tenureMonths: number,
) {
  return loanMonthlyPayment(principal, annualRate, tenureMonths)
}

function getRemainingMonths(
  startDate: string,
  tenureMonths: number,
): number {
  const start = new Date(startDate)
  const end = new Date(start)
  end.setMonth(end.getMonth() + tenureMonths)
  const now = new Date()
  const diff =
    (end.getFullYear() - now.getFullYear()) * 12 +
    (end.getMonth() - now.getMonth())
  return Math.max(0, diff)
}

function getMonthsElapsed(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date()
  return (
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  )
}

function isInLockIn(lockInEndDate: string | null | undefined): boolean {
  if (!lockInEndDate) return false
  return new Date().toISOString().slice(0, 10) <= lockInEndDate
}

export default function LoansPage() {
  const { activeProfileId, activeFamilyId, profiles } = useActiveProfile()
  const [loans, setLoans] = useState<Loan[]>([])
  const [housingData, setHousingData] = useState<HousingData | null>(null)
  const [repaymentRows, setRepaymentRows] = useState<RepaymentRow[]>([])
  const [earlyRows, setEarlyRows] = useState<RepaymentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedPrepay, setExpandedPrepay] = useState<string | null>(null)

  // CRUD state
  const [loanFormOpen, setLoanFormOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<LoanFormData | null>(null)
  const [repaymentFormOpen, setRepaymentFormOpen] = useState(false)
  const [repaymentLoanId, setRepaymentLoanId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingLoan, setDeletingLoan] = useState<{ id: string; name: string } | null>(null)

  const fetchData = useCallback(async () => {
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

      const [loansRes, housingRes, repayRes] = await Promise.all([
        fetch(`/api/loans?${qs}`),
        fetch(`/api/cpf/housing?${qs}`),
        fetch(`/api/loans/repayments?${qs}`),
      ])

      if (loansRes.ok) {
        const json = await loansRes.json()
        setLoans(json ?? [])
      }
      if (housingRes.ok) {
        const json = await housingRes.json()
        setHousingData(json)
      }
      if (repayRes.ok) {
        const json = (await repayRes.json()) as {
          repayments?: RepaymentRow[]
          earlyRepayments?: RepaymentRow[]
        }
        setRepaymentRows(json.repayments ?? [])
        setEarlyRows(json.earlyRepayments ?? [])
      }
    } catch (error) {
      console.error("Failed to fetch loans:", error)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfileId, activeFamilyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalPrincipal = useMemo(
    () => loans.reduce((sum, l) => sum + l.principal, 0),
    [loans],
  )
  const totalMonthly = useMemo(
    () =>
      loans.reduce(
        (sum, l) =>
          sum +
          calculateMonthlyPayment(l.principal, l.rate_pct, l.tenure_months),
        0,
      ),
    [loans],
  )

  const hasCpfLoans = useMemo(
    () => loans.some((l) => l.use_cpf_oa),
    [loans],
  )

  const { scheduledByLoan, earlyByLoan } = useMemo(() => {
    const sMap = new Map<string, RepaymentRow[]>()
    const eMap = new Map<string, RepaymentRow[]>()
    for (const r of repaymentRows) {
      const arr = sMap.get(r.loan_id) ?? []
      arr.push(r)
      sMap.set(r.loan_id, arr)
    }
    for (const r of earlyRows) {
      const arr = eMap.get(r.loan_id) ?? []
      arr.push(r)
      eMap.set(r.loan_id, arr)
    }
    for (const arr of sMap.values())
      arr.sort((a, b) => a.date.localeCompare(b.date))
    for (const arr of eMap.values())
      arr.sort((a, b) => a.date.localeCompare(b.date))
    return { scheduledByLoan: sMap, earlyByLoan: eMap }
  }, [repaymentRows, earlyRows])

  function openEdit(loan: Loan) {
    setEditingLoan(loan)
    setLoanFormOpen(true)
  }

  function openAdd() {
    setEditingLoan(null)
    setLoanFormOpen(true)
  }

  function openRepayment(loanId?: string) {
    setRepaymentLoanId(loanId ?? null)
    setRepaymentFormOpen(true)
  }

  function openDelete(loan: Loan) {
    setDeletingLoan({ id: loan.id, name: loan.name })
    setDeleteDialogOpen(true)
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          title="Loans"
          description="Loan tracking, repayments, and interest overview."
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openRepayment()}>
            <Receipt className="mr-1.5 h-4 w-4" />
            Log Repayment
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Loan
          </Button>
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </>
      ) : loans.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border bg-card text-sm text-muted-foreground">
          <p>No loans found for this profile.</p>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add your first loan
          </Button>
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
            <MetricCard label="Active Loans" value={`${loans.length}`} />
          </div>

          {hasCpfLoans && (
            <div className="space-y-4">
              <SectionHeader
                title="CPF Housing"
                description="CPF OA used for housing and refund due on sale."
              />
              <p className="text-sm text-muted-foreground">
                Tranches, accrued interest, and 120% VL are on the{" "}
                <Link
                  href="/dashboard/cpf?tab=housing"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  CPF Housing tab
                </Link>
                .
              </p>
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
                  label="120% VL headroom"
                  value={
                    housingData?.vlRemaining != null
                      ? housingData.vlRemaining
                      : "Add VL on loan"
                  }
                  prefix={
                    housingData?.vlRemaining != null ? "$" : undefined
                  }
                  tooltipId="CPF_HOUSING_REFUND"
                />
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Loan</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Principal
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Monthly
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Est. balance
                    </th>
                    <th className="px-4 py-3 text-center font-medium">
                      CPF OA
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => {
                    const isSplit =
                      loan.split_profile_id != null &&
                      (loan.split_pct ?? 100) < 100
                    const isPrimary =
                      !activeProfileId ||
                      loan.profile_id === activeProfileId
                    const splitPct = loan.split_pct ?? 100

                    // Effective principal for this profile
                    const displayPrincipal =
                      isSplit && activeProfileId
                        ? splitLoanAmount(
                            loan.principal,
                            splitPct,
                            isPrimary,
                          )
                        : loan.principal

                    // Current effective rate (with annual increase)
                    const monthsElapsed = getMonthsElapsed(loan.start_date)
                    const currentRate = effectiveRate(
                      loan.rate_pct,
                      loan.rate_increase_pct,
                      monthsElapsed,
                    )

                    const monthly = calculateMonthlyPayment(
                      displayPrincipal,
                      currentRate,
                      loan.tenure_months,
                    )
                    const remaining = getRemainingMonths(
                      loan.start_date,
                      loan.tenure_months,
                    )
                    const years = Math.floor(remaining / 12)
                    const months = remaining % 12

                    const fullOutstanding = estimateOutstandingPrincipal(
                      loan.principal,
                      loan.rate_pct,
                      scheduledByLoan.get(loan.id) ?? [],
                      earlyByLoan.get(loan.id) ?? [],
                    )
                    const outstanding =
                      isSplit && activeProfileId
                        ? splitLoanAmount(
                            fullOutstanding,
                            splitPct,
                            isPrimary,
                          )
                        : fullOutstanding

                    const inLockIn = isInLockIn(loan.lock_in_end_date)

                    return (
                      <tr key={loan.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{loan.name}</span>
                            {isSplit && (
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                Split{" "}
                                {isPrimary
                                  ? `${splitPct}%`
                                  : `${100 - splitPct}%`}
                              </Badge>
                            )}
                            {loan.property_type && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] uppercase"
                              >
                                {loan.property_type}
                              </Badge>
                            )}
                            {inLockIn && (
                              <Badge
                                variant="destructive"
                                className="text-[10px]"
                              >
                                Lock-in until{" "}
                                {loan.lock_in_end_date}
                              </Badge>
                            )}
                          </div>
                          {loan.lender && (
                            <div className="text-xs text-muted-foreground">
                              {loan.lender}
                            </div>
                          )}
                          {isSplit && (
                            <div className="text-[10px] text-muted-foreground">
                              {splitPct}% / {100 - splitPct}% split
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {loan.type}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ${formatCurrency(displayPrincipal)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <div>{currentRate.toFixed(2)}%</div>
                          {loan.rate_increase_pct != null &&
                            loan.rate_increase_pct > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                +{loan.rate_increase_pct}%/yr
                              </div>
                            )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ${formatCurrency(monthly)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-medium tabular-nums">
                            ${formatCurrency(outstanding)}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {outstanding <= 0 ? (
                              <Badge
                                variant="default"
                                className="bg-green-600/20 text-green-700 hover:bg-green-600/30 dark:text-green-400"
                              >
                                Paid off
                              </Badge>
                            ) : remaining === 0 ? (
                              "Past scheduled end"
                            ) : (
                              `${years > 0 ? `${years}y ` : ""}${months}m left on tenure`
                            )}
                          </div>
                          {outstanding > 0 && (
                            <button
                              onClick={() =>
                                setExpandedPrepay(
                                  expandedPrepay === loan.id
                                    ? null
                                    : loan.id,
                                )
                              }
                              className="mt-1 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            >
                              {expandedPrepay === loan.id
                                ? "Hide"
                                : "Prepayment calc"}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {loan.use_cpf_oa ? "✓" : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Log repayment"
                              onClick={() => openRepayment(loan.id)}
                            >
                              <Receipt className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Edit loan"
                              onClick={() => openEdit(loan)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Delete loan"
                              onClick={() => openDelete(loan)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Prepayment Calculator (expandable per loan) */}
          {expandedPrepay && (() => {
            const loan = loans.find((l) => l.id === expandedPrepay)
            if (!loan) return null
            const fullOutstanding = estimateOutstandingPrincipal(
              loan.principal,
              loan.rate_pct,
              scheduledByLoan.get(loan.id) ?? [],
              earlyByLoan.get(loan.id) ?? [],
            )
            const remaining = getRemainingMonths(
              loan.start_date,
              loan.tenure_months,
            )
            if (fullOutstanding <= 0 || remaining <= 0) return null

            const sampleAmounts = [10000, 25000, 50000, 100000].filter(
              (a) => a <= fullOutstanding,
            )
            const inLockIn = isInLockIn(loan.lock_in_end_date)
            const penaltyPct =
              inLockIn && loan.early_repayment_penalty_pct != null
                ? Number(loan.early_repayment_penalty_pct)
                : 0

            return (
              <div className="rounded-xl border bg-card p-4">
                <h4 className="mb-3 text-sm font-medium">
                  Prepayment Calculator — {loan.name}
                </h4>
                {loan.property_type === "private" && inLockIn && (
                  <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
                    Lock-in penalty: {penaltyPct}% on prepayment amount
                    until {loan.lock_in_end_date}
                  </p>
                )}
                {loan.max_annual_prepayment_pct != null && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Annual prepayment limit:{" "}
                    {loan.max_annual_prepayment_pct}% of outstanding (
                    $
                    {formatCurrency(
                      fullOutstanding *
                        (loan.max_annual_prepayment_pct / 100),
                    )}
                    )
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          Prepay
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Interest saved
                        </th>
                        {penaltyPct > 0 && (
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Penalty
                          </th>
                        )}
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Net savings
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Months saved
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampleAmounts.map((amt) => {
                        const penalty = Math.round(
                          amt * (penaltyPct / 100) * 100,
                        ) / 100
                        const est = prepaymentSavingsEstimate(
                          fullOutstanding,
                          loan.rate_pct,
                          remaining,
                          amt,
                          penalty,
                        )
                        return (
                          <tr
                            key={amt}
                            className="border-b last:border-0"
                          >
                            <td className="px-3 py-2 tabular-nums">
                              ${formatCurrency(amt)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-green-600 dark:text-green-400">
                              ${formatCurrency(est.interestSaved)}
                            </td>
                            {penaltyPct > 0 && (
                              <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                                ${formatCurrency(penalty)}
                              </td>
                            )}
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              ${formatCurrency(est.netSavings)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {est.monthsSaved === Infinity
                                ? "—"
                                : est.monthsSaved}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* Loan Add/Edit Sheet */}
      <LoanFormSheet
        open={loanFormOpen}
        onOpenChange={setLoanFormOpen}
        onSuccess={fetchData}
        profiles={profiles}
        defaultProfileId={activeProfileId}
        loan={editingLoan}
      />

      {/* Repayment Sheet */}
      <RepaymentFormSheet
        open={repaymentFormOpen}
        onOpenChange={setRepaymentFormOpen}
        onSuccess={fetchData}
        loans={loans.map((l) => ({
          id: l.id,
          name: l.name,
          use_cpf_oa: l.use_cpf_oa,
        }))}
        defaultLoanId={repaymentLoanId}
      />

      {/* Delete Dialog */}
      {deletingLoan && (
        <DeleteLoanDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onSuccess={fetchData}
          loanId={deletingLoan.id}
          loanName={deletingLoan.name}
        />
      )}
    </div>
  )
}
