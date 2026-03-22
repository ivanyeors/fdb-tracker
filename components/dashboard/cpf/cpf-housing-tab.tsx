"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/dashboard/metric-card"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
import { useActiveProfile } from "@/hooks/use-active-profile"

export type CpfHousingApiLoan = {
  loanId: string
  name: string
  type: string
  valuationLimit: number | null
  profileId: string
  splitProfileId: string | null
  splitPct: number | null
  propertyType: string | null
  totalPrincipal: number
  totalAccruedInterest: number
  refundDue: number
  vlHeadroom120: number | null
  tranches: Array<{
    id: string
    profileId: string | null
    principalWithdrawn: number
    withdrawalDate: string
    usageType: string | null
    monthsElapsed: number
    accruedInterest: number
  }>
}

export type CpfHousingApiResponse = {
  asOf: string
  oaUsed: number
  accruedInterest: number
  refundDue: number
  vlRemaining: number | null
  loans: CpfHousingApiLoan[]
}

const USAGE_OPTIONS = [
  { value: "downpayment", label: "Down payment" },
  { value: "monthly", label: "Monthly instalment" },
  { value: "stamp_duty", label: "Stamp duty" },
  { value: "legal", label: "Legal fees" },
  { value: "hps", label: "HPS / other" },
  { value: "other", label: "Other" },
] as const

export function CpfHousingTab({
  data,
  isLoading,
  onRefresh,
  isFamilyView,
}: {
  data: CpfHousingApiResponse | null
  isLoading: boolean
  onRefresh: () => void
  isFamilyView?: boolean
}) {
  const { profiles } = useActiveProfile()
  const [loanId, setLoanId] = useState<string>("")
  const [profileId, setProfileId] = useState<string>("")
  const [amount, setAmount] = useState<number | null>(null)
  const [withdrawalDate, setWithdrawalDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [usageType, setUsageType] = useState<string>("downpayment")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const cpfLoanOptions =
    data?.loans.map((l) => ({ id: l.loanId, name: l.name })) ?? []

  // Check if selected loan is a split HDB loan
  const selectedLoan = data?.loans.find((l) => l.loanId === loanId)
  const isSplitLoan =
    selectedLoan?.splitProfileId != null &&
    (selectedLoan.splitPct ?? 100) < 100 &&
    selectedLoan.propertyType === "hdb"
  const splitProfileOptions = isSplitLoan
    ? [
        profiles.find((p) => p.id === selectedLoan.profileId),
        profiles.find((p) => p.id === selectedLoan.splitProfileId),
      ].filter(Boolean)
    : []

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!loanId || !cpfLoanOptions.some((l) => l.id === loanId)) {
      toast.error("Select a loan that uses CPF OA")
      return
    }
    const principal = amount
    if (principal == null || !Number.isFinite(principal) || principal <= 0) {
      toast.error("Enter a positive amount")
      return
    }
    if (isSplitLoan && !profileId) {
      toast.error("Select whose CPF OA to debit")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/cpf/housing/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId,
          ...(profileId && { profileId }),
          principalWithdrawn: principal,
          withdrawalDate,
          usageType,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? "Failed to save")
      }
      toast.success("Withdrawal recorded")
      setAmount(null)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(trancheId: string) {
    setDeletingId(trancheId)
    try {
      const res = await fetch(`/api/cpf/housing/usage/${trancheId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Removed")
      onRefresh()
    } catch {
      toast.error("Failed to delete")
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetricCard label="" value={0} loading prefix="$" />
          <MetricCard label="" value={0} loading prefix="$" />
        </div>
      </div>
    )
  }

  if (!data || data.loans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CPF housing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Add a loan in{" "}
            <Link href="/settings/users" className="text-primary underline">
              User Settings
            </Link>{" "}
            and enable <strong>Uses CPF OA</strong> to track OA used for housing,
            accrued interest, and 120% valuation limit headroom.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Estimates from your withdrawal dates — compare with your{" "}
        <a
          href="https://www.cpf.gov.sg/member/ds/dashboards/home-ownership"
          className="text-primary underline"
          target="_blank"
          rel="noreferrer"
        >
          CPF home ownership
        </a>{" "}
        figures. As of {data.asOf}.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="CPF OA used (principal)"
          value={data.oaUsed}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
        <MetricCard
          label="Accrued interest (est.)"
          value={data.accruedInterest}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
        <MetricCard
          label="Total refund if sold (est.)"
          value={data.refundDue}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
        <MetricCard
          label="120% VL headroom (sum)"
          value={data.vlRemaining ?? 0}
          prefix="$"
          tooltipId="CPF_HOUSING_REFUND"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log CPF housing withdrawal</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Loan</Label>
              <Select value={loanId} onValueChange={(v) => { setLoanId(v); setProfileId("") }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select loan" />
                </SelectTrigger>
                <SelectContent>
                  {cpfLoanOptions.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSplitLoan && splitProfileOptions.length > 0 && (
              <div className="space-y-1">
                <Label>CPF profile</Label>
                <Select value={profileId} onValueChange={setProfileId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Whose CPF?" />
                  </SelectTrigger>
                  <SelectContent>
                    {splitProfileOptions.map((p) => (
                      <SelectItem key={p!.id} value={p!.id}>
                        {p!.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>OA amount</Label>
              <CurrencyInput
                className="w-28"
                placeholder="0.00"
                value={amount}
                onChange={(v) => setAmount(v)}
              />
            </div>
            <div className="space-y-1">
              <Label>Withdrawal date</Label>
              <DatePicker
                value={withdrawalDate || null}
                onChange={(d) => setWithdrawalDate(d ?? "")}
                placeholder="Date"
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={usageType} onValueChange={setUsageType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {data.loans.map((loan) => (
        <Card key={loan.loanId}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{loan.name}</CardTitle>
            {loan.valuationLimit != null && loan.valuationLimit > 0 && (
              <span className="text-xs text-muted-foreground">
                VL (user est.): ${formatCurrency(loan.valuationLimit)} · 120% cap: $
                {formatCurrency(1.2 * loan.valuationLimit)}
                {loan.vlHeadroom120 != null && (
                  <> · Headroom: ${formatCurrency(loan.vlHeadroom120)}</>
                )}
              </span>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loan.tranches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No withdrawals logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {isFamilyView && <TableHead>Profile</TableHead>}
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Months</TableHead>
                    <TableHead className="text-right">Accrued</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loan.tranches.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="tabular-nums">{t.withdrawalDate}</TableCell>
                      {isFamilyView && (
                        <TableCell className="text-muted-foreground">
                          {profiles.find((p) => p.id === t.profileId)?.name ?? "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground">
                        {t.usageType ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${formatCurrency(t.principalWithdrawn)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.monthsElapsed}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${formatCurrency(t.accruedInterest)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={deletingId === t.id}
                          onClick={() => handleDelete(t.id)}
                        >
                          {deletingId === t.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
