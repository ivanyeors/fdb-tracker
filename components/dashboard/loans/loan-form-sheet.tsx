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
import { Input } from "@/components/ui/input"
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
import { ImpactConfirmationDialog } from "@/components/ui/impact-confirmation-dialog"
import { useImpactConfirmation } from "@/hooks/use-impact-confirmation"
import type { Profile } from "@/hooks/use-active-profile"

export type LoanFormData = {
  id?: string
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
}

interface LoanFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  profiles: Profile[]
  defaultProfileId?: string | null
  loan?: LoanFormData | null
}

export function LoanFormSheet({
  open,
  onOpenChange,
  onSuccess,
  profiles,
  defaultProfileId,
  loan,
}: LoanFormSheetProps) {
  const isEdit = !!loan?.id

  const [profileId, setProfileId] = useState(loan?.profile_id ?? defaultProfileId ?? "")
  const [name, setName] = useState(loan?.name ?? "")
  const [type, setType] = useState(loan?.type ?? "housing")
  const [principal, setPrincipal] = useState<number | null>(loan?.principal ?? null)
  const [ratePct, setRatePct] = useState<number | null>(loan?.rate_pct ?? null)
  const [tenureMonths, setTenureMonths] = useState(loan?.tenure_months?.toString() ?? "")
  const [startDate, setStartDate] = useState(loan?.start_date ?? "")
  const [lender, setLender] = useState(loan?.lender ?? "")
  const [useCpfOa, setUseCpfOa] = useState(loan?.use_cpf_oa ?? type === "housing")
  const [valuationLimit, setValuationLimit] = useState<number | null>(
    loan?.valuation_limit ?? null,
  )
  const [splitProfileId, setSplitProfileId] = useState(loan?.split_profile_id || "none")
  const [splitPct, setSplitPct] = useState(loan?.split_pct?.toString() ?? "100")
  const [rateIncreasePct, setRateIncreasePct] = useState<number | null>(
    loan?.rate_increase_pct ?? null,
  )
  const [propertyType, setPropertyType] = useState(loan?.property_type ?? "")
  const [lockInEndDate, setLockInEndDate] = useState(loan?.lock_in_end_date ?? "")
  const [earlyRepaymentPenaltyPct, setEarlyRepaymentPenaltyPct] = useState<number | null>(
    loan?.early_repayment_penalty_pct ?? null,
  )
  const [maxAnnualPrepaymentPct, setMaxAnnualPrepaymentPct] = useState<number | null>(
    loan?.max_annual_prepayment_pct ?? null,
  )
  const [saving, setSaving] = useState(false)
  const loanImpact = useImpactConfirmation("loan.details")

  // Reset form when loan changes
  useEffect(() => {
    if (open) {
      setProfileId(loan?.profile_id ?? defaultProfileId ?? profiles[0]?.id ?? "")
      setName(loan?.name ?? "")
      setType(loan?.type ?? "housing")
      setPrincipal(loan?.principal ?? null)
      setRatePct(loan?.rate_pct ?? null)
      setTenureMonths(loan?.tenure_months?.toString() ?? "")
      setStartDate(loan?.start_date ?? "")
      setLender(loan?.lender ?? "")
      setUseCpfOa(loan?.use_cpf_oa ?? (loan?.type ?? "housing") === "housing")
      setValuationLimit(loan?.valuation_limit ?? null)
      setSplitProfileId(loan?.split_profile_id || "none")
      setSplitPct(loan?.split_pct?.toString() ?? "100")
      setRateIncreasePct(loan?.rate_increase_pct ?? null)
      setPropertyType(loan?.property_type ?? "")
      setLockInEndDate(loan?.lock_in_end_date ?? "")
      setEarlyRepaymentPenaltyPct(loan?.early_repayment_penalty_pct ?? null)
      setMaxAnnualPrepaymentPct(loan?.max_annual_prepayment_pct ?? null)
    }
  }, [open, loan, defaultProfileId, profiles])

  const isHousing = type === "housing"
  const isPrivate = propertyType === "private"

  async function handleSave() {
    if (!name.trim()) return toast.error("Name is required")
    if (!principal || principal <= 0) return toast.error("Principal must be positive")
    if (ratePct == null || ratePct < 0) return toast.error("Rate must be >= 0")
    const months = parseInt(tenureMonths)
    if (!months || months <= 0) return toast.error("Tenure must be positive")
    if (!startDate) return toast.error("Start date is required")
    if (!profileId) return toast.error("Profile is required")

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        principal,
        ratePct: ratePct,
        tenureMonths: months,
        startDate,
        lender: lender.trim() || null,
        useCpfOa: useCpfOa,
      }

      if (isHousing && useCpfOa) {
        body.valuationLimit = valuationLimit || null
        body.propertyType = propertyType || null
        body.rateIncreasePct = rateIncreasePct || null
        if (splitProfileId && splitProfileId !== "none") {
          body.splitProfileId = splitProfileId
          body.splitPct = parseInt(splitPct) || 100
        } else {
          body.splitProfileId = null
          body.splitPct = 100
        }
        if (isPrivate) {
          body.lockInEndDate = lockInEndDate || null
          body.earlyRepaymentPenaltyPct = earlyRepaymentPenaltyPct || null
          body.maxAnnualPrepaymentPct = maxAnnualPrepaymentPct || null
        }
      }

      if (isEdit) {
        const res = await fetch(`/api/loans/${loan!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? "Failed to update loan")
        }
        toast.success("Loan updated")
      } else {
        body.profileId = profileId
        const res = await fetch("/api/loans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? "Failed to create loan")
        }
        toast.success("Loan added")
      }

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
          <ResponsiveSheetTitle>{isEdit ? "Edit Loan" : "Add Loan"}</ResponsiveSheetTitle>
          <ResponsiveSheetDescription>
            {isEdit ? "Update loan details." : "Add a new loan to track."}
          </ResponsiveSheetDescription>
        </ResponsiveSheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4">
          <div className="space-y-4 pb-4">
            {/* Profile */}
            {profiles.length > 1 && !isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="loan-profile">Profile</Label>
                <Select value={profileId} onValueChange={setProfileId}>
                  <SelectTrigger id="loan-profile" className="w-full">
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Type */}
            <div className="space-y-1.5">
              <Label htmlFor="loan-type">Type</Label>
              <ButtonSelect
                value={type}
                onValueChange={(v) => {
                  setType(v)
                  if (v === "housing") setUseCpfOa(true)
                  else setUseCpfOa(false)
                }}
                options={[
                  { value: "housing", label: "Housing" },
                  { value: "personal", label: "Personal" },
                  { value: "car", label: "Car" },
                  { value: "education", label: "Education" },
                ]}
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="loan-name">Name</Label>
              <Input
                id="loan-name"
                placeholder="e.g. HDB Loan, Car Loan"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Principal + Rate */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="loan-principal">Principal ($)</Label>
                <CurrencyInput
                  id="loan-principal"
                  value={principal}
                  onChange={(v) => setPrincipal(v ?? null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan-rate">Rate (% p.a.)</Label>
                <CurrencyInput
                  id="loan-rate"
                  value={ratePct}
                  onChange={(v) => setRatePct(v ?? null)}
                  placeholder="e.g. 2.6"
                />
              </div>
            </div>

            {/* Tenure + Start Date */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="loan-tenure">Tenure (months)</Label>
                <Input
                  id="loan-tenure"
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 300"
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan-start">Start Date</Label>
                <DatePicker
                  id="loan-start"
                  value={startDate || null}
                  onChange={(d) => setStartDate(d ?? "")}
                  className="w-full"
                />
              </div>
            </div>

            {/* Lender */}
            <div className="space-y-1.5">
              <Label htmlFor="loan-lender">Lender (optional)</Label>
              <Input
                id="loan-lender"
                placeholder="e.g. DBS, HDB"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
              />
            </div>

            {/* CPF OA toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="loan-cpf"
                checked={useCpfOa}
                onCheckedChange={setUseCpfOa}
              />
              <Label htmlFor="loan-cpf">Uses CPF OA</Label>
            </div>

            {/* Housing + CPF-specific fields */}
            {isHousing && useCpfOa && (
              <div className="space-y-4 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Housing Loan Details
                </p>

                {/* Property Type */}
                <div className="space-y-1.5">
                  <Label htmlFor="loan-property-type">Property Type</Label>
                  <ButtonSelect
                    value={propertyType}
                    onValueChange={setPropertyType}
                    options={[
                      { value: "hdb", label: "HDB" },
                      { value: "private", label: "Private" },
                    ]}
                  />
                </div>

                {/* Valuation Limit */}
                <div className="space-y-1.5">
                  <Label htmlFor="loan-vl">
                    Valuation Limit ($)
                  </Label>
                  <CurrencyInput
                    id="loan-vl"
                    value={valuationLimit}
                    onChange={(v) => setValuationLimit(v ?? null)}
                    placeholder="Lower of purchase price or valuation"
                  />
                  <p className="text-xs text-muted-foreground">
                    CPF withdrawal capped at 120% of this value
                  </p>
                </div>

                {/* Rate Increase */}
                <div className="space-y-1.5">
                  <Label htmlFor="loan-rate-inc">Annual Rate Increase (% p.a.)</Label>
                  <CurrencyInput
                    id="loan-rate-inc"
                    value={rateIncreasePct}
                    onChange={(v) => setRateIncreasePct(v ?? null)}
                    placeholder="e.g. 0.10"
                  />
                </div>

                {/* Split Partner */}
                {profiles.length > 1 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="loan-split-partner">Split Partner</Label>
                      <Select
                        value={splitProfileId}
                        onValueChange={setSplitProfileId}
                      >
                        <SelectTrigger id="loan-split-partner" className="w-full">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {profiles
                            .filter((p) => p.id !== profileId)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {splitProfileId && splitProfileId !== "none" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="loan-split-pct">Your Share (%)</Label>
                        <Input
                          id="loan-split-pct"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={99}
                          value={splitPct}
                          onChange={(e) => setSplitPct(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Private-specific fields */}
                {isPrivate && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="loan-lockin">Lock-in End Date</Label>
                      <DatePicker
                        id="loan-lockin"
                        value={lockInEndDate || null}
                        onChange={(d) => setLockInEndDate(d ?? "")}
                        className="w-full"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="loan-penalty">Early Repay Penalty (%)</Label>
                        <CurrencyInput
                          id="loan-penalty"
                          value={earlyRepaymentPenaltyPct}
                          onChange={(v) => setEarlyRepaymentPenaltyPct(v ?? null)}
                          placeholder="e.g. 1.5"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="loan-max-prepay">Max Annual Prepay (%)</Label>
                        <CurrencyInput
                          id="loan-max-prepay"
                          value={maxAnnualPrepaymentPct}
                          onChange={(v) => setMaxAnnualPrepaymentPct(v ?? null)}
                          placeholder="e.g. 50"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <ResponsiveSheetFooter className="px-4 pb-4">
          <Button onClick={() => loanImpact.requestChange(handleSave)} disabled={saving} className="w-full">
            {saving ? "Saving..." : isEdit ? "Update Loan" : "Add Loan"}
          </Button>
        </ResponsiveSheetFooter>
      </ResponsiveSheetContent>
      <ImpactConfirmationDialog {...loanImpact.dialogProps} />
    </ResponsiveSheet>
  )
}
