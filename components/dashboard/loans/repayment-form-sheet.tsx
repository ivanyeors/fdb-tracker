"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  ResponsiveSheet,
  ResponsiveSheetContent,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
  ResponsiveSheetDescription,
  ResponsiveSheetFooter,
} from "@/components/ui/responsive-sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CurrencyInput } from "@/components/ui/currency-input"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ButtonSelect } from "@/components/ui/button-select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  prepaymentSavingsEstimate,
  calculateEarlyRepaymentPenalty,
} from "@/lib/calculations/loans"
import { formatCurrency } from "@/lib/utils"

interface LoanOption {
  id: string
  name: string
  use_cpf_oa: boolean
  outstanding?: number
  rate_pct?: number
  remaining_months?: number
  property_type?: string | null
  lock_in_end_date?: string | null
  early_repayment_penalty_pct?: number | null
  split_profile_id?: string | null
  split_pct?: number | null
}

interface RepaymentFormSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSuccess: () => void
  readonly loans: LoanOption[]
  readonly defaultLoanId?: string | null
}

export function RepaymentFormSheet({
  open,
  onOpenChange,
  onSuccess,
  loans,
  defaultLoanId,
}: RepaymentFormSheetProps) {
  const [loanId, setLoanId] = useState(defaultLoanId ?? "")
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [cpfOaAmount, setCpfOaAmount] = useState<number | null>(null)
  const [isEarly, setIsEarly] = useState(false)
  const [source, setSource] = useState<"cash" | "cpf_oa">("cash")
  const [saving, setSaving] = useState(false)

  const selectedLoan = loans.find((l) => l.id === loanId)
  const showCpf = selectedLoan?.use_cpf_oa && !isEarly

  useEffect(() => {
    if (open) {
      setLoanId(defaultLoanId ?? loans[0]?.id ?? "")
      setAmount(null)
      setDate(new Date().toISOString().slice(0, 10))
      setCpfOaAmount(null)
      setIsEarly(false)
      setSource("cash")
    }
  }, [open, defaultLoanId, loans])

  async function handleSave() {
    if (!loanId) return toast.error("Select a loan")
    if (!amount || amount <= 0) return toast.error("Amount must be positive")
    if (!date) return toast.error("Date is required")
    if (showCpf && cpfOaAmount != null && cpfOaAmount > amount) {
      return toast.error("CPF OA amount cannot exceed repayment")
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        loanId,
        amount,
        date,
        isEarly,
      }
      if (isEarly) {
        body.source = source
      }
      if (showCpf && cpfOaAmount != null && cpfOaAmount > 0) {
        body.cpfOaAmount = cpfOaAmount
      }

      const res = await fetch("/api/loans/repayments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to log repayment")
      }

      toast.success(isEarly ? "Early repayment logged" : "Repayment logged")
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange}>
      <ResponsiveSheetContent side="right" className="flex flex-col">
        <ResponsiveSheetHeader>
          <ResponsiveSheetTitle>Log Repayment</ResponsiveSheetTitle>
          <ResponsiveSheetDescription>
            Record a scheduled or early loan repayment.
          </ResponsiveSheetDescription>
        </ResponsiveSheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4">
          <div className="space-y-4 pb-4">
            {/* Loan selector */}
            <div className="space-y-1.5">
              <Label htmlFor="repay-loan">Loan</Label>
              <Select value={loanId} onValueChange={setLoanId}>
                <SelectTrigger id="repay-loan" className="w-full">
                  <SelectValue placeholder="Select loan" />
                </SelectTrigger>
                <SelectContent>
                  {loans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount + Date */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="repay-amount">Amount ($)</Label>
                <CurrencyInput
                  id="repay-amount"
                  value={amount}
                  onChange={(v) => setAmount(v ?? null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repay-date">Date</Label>
                <DatePicker
                  id="repay-date"
                  value={date || null}
                  onChange={(d) => setDate(d ?? "")}
                  className="w-full"
                />
              </div>
            </div>

            {/* Early repayment toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="repay-early"
                checked={isEarly}
                onCheckedChange={setIsEarly}
              />
              <Label htmlFor="repay-early">Early repayment</Label>
            </div>

            {/* Source for early repayment */}
            {isEarly && selectedLoan?.use_cpf_oa && (
              <div className="space-y-1.5">
                <Label htmlFor="repay-source">Source</Label>
                <ButtonSelect
                  value={source}
                  onValueChange={(v) => setSource(v as "cash" | "cpf_oa")}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "cpf_oa", label: "CPF OA" },
                  ]}
                />
              </div>
            )}

            {/* CPF OA amount (regular repayments for CPF loans) */}
            {showCpf && (
              <div className="space-y-1.5">
                <Label htmlFor="repay-cpf">CPF OA Portion ($)</Label>
                <CurrencyInput
                  id="repay-cpf"
                  value={cpfOaAmount}
                  onChange={(v) => setCpfOaAmount(v ?? null)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Amount paid from CPF OA (leave blank if fully cash)
                </p>
              </div>
            )}

            {/* Early repayment savings preview */}
            {isEarly && selectedLoan && amount && amount > 0 && selectedLoan.outstanding != null && selectedLoan.outstanding > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <p className="font-medium text-foreground">Early Repayment Preview</p>
                {(() => {
                  const penalty = calculateEarlyRepaymentPenalty(
                    amount,
                    {
                      property_type: selectedLoan.property_type ?? null,
                      lock_in_end_date: selectedLoan.lock_in_end_date ?? null,
                      early_repayment_penalty_pct: selectedLoan.early_repayment_penalty_pct ?? null,
                    },
                    date,
                  )
                  const savings = prepaymentSavingsEstimate(
                    selectedLoan.outstanding,
                    selectedLoan.rate_pct ?? 0,
                    selectedLoan.remaining_months ?? 0,
                    amount,
                    penalty,
                  )
                  const newBalance = Math.max(0, selectedLoan.outstanding - amount)
                  const isSplit = selectedLoan.split_profile_id != null && (selectedLoan.split_pct ?? 100) < 100
                  return (
                    <>
                      <div className="flex justify-between text-muted-foreground">
                        <span>New outstanding</span>
                        <span className="tabular-nums font-medium text-foreground">${formatCurrency(newBalance)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Interest saved</span>
                        <span className="tabular-nums text-emerald-600 dark:text-emerald-400">${formatCurrency(savings.interestSaved)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Months saved</span>
                        <span className="tabular-nums">{savings.monthsSaved}</span>
                      </div>
                      {penalty > 0 && (
                        <>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Penalty</span>
                            <span className="tabular-nums text-red-600 dark:text-red-400">${formatCurrency(penalty)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Net savings</span>
                            <span className="tabular-nums font-medium text-foreground">${formatCurrency(savings.netSavings)}</span>
                          </div>
                        </>
                      )}
                      {isSplit && (
                        <p className="text-xs text-muted-foreground mt-1 border-t pt-1.5">
                          This repayment reduces the total outstanding balance. Both shares will be adjusted proportionally.
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </ScrollArea>

        <ResponsiveSheetFooter className="px-4 pb-4">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Log Repayment"}
          </Button>
        </ResponsiveSheetFooter>
      </ResponsiveSheetContent>
    </ResponsiveSheet>
  )
}
