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
import { ScrollArea } from "@/components/ui/scroll-area"

interface LoanOption {
  id: string
  name: string
  use_cpf_oa: boolean
}

interface RepaymentFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  loans: LoanOption[]
  defaultLoanId?: string | null
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
                <Select value={source} onValueChange={(v) => setSource(v as "cash" | "cpf_oa")}>
                  <SelectTrigger id="repay-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cpf_oa">CPF OA</SelectItem>
                  </SelectContent>
                </Select>
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
