"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  INSURANCE_TYPES,
  INSURANCE_TYPE_LABELS,
  type InsuranceType,
} from "@/lib/insurance/coverage-config"
import type { Profile } from "@/hooks/use-active-profile"

interface PolicyFormSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSuccess: () => void
  readonly profiles: readonly Profile[]
  readonly defaultProfileId?: string | null
}

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const

export function PolicyFormSheet({
  open,
  onOpenChange,
  onSuccess,
  profiles,
  defaultProfileId,
}: PolicyFormSheetProps) {
  const [profileId, setProfileId] = useState<string>(defaultProfileId ?? "")
  const [name, setName] = useState("")
  const [type, setType] = useState<InsuranceType>("term_life")
  const [insurer, setInsurer] = useState("")
  const [premiumAmount, setPremiumAmount] = useState<number | null>(null)
  const [frequency, setFrequency] = useState<"monthly" | "yearly">("yearly")
  const [coverageAmount, setCoverageAmount] = useState<number | null>(null)
  const [premiumWaiver, setPremiumWaiver] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset when reopened
  useEffect(() => {
    if (!open) return
    setProfileId(defaultProfileId ?? "")
    setName("")
    setType("term_life")
    setInsurer("")
    setPremiumAmount(null)
    setFrequency("yearly")
    setCoverageAmount(null)
    setPremiumWaiver(false)
  }, [open, defaultProfileId])

  const canSubmit =
    !!profileId && name.trim().length > 0 && (premiumAmount ?? 0) >= 0

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error("Add a policy name and select a profile first")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/insurance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          name: name.trim(),
          type,
          premiumAmount: premiumAmount ?? 0,
          frequency,
          coverageAmount: coverageAmount ?? null,
          insurer: insurer.trim() || null,
          premiumWaiver,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.error ?? "Failed to create policy")
      }
      toast.success("Policy added")
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add policy"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange}>
      <ResponsiveSheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <ResponsiveSheetHeader className="border-b p-4 text-left">
          <ResponsiveSheetTitle>Add insurance policy</ResponsiveSheetTitle>
          <ResponsiveSheetDescription>
            Track a new policy and its premium for coverage gap analysis.
          </ResponsiveSheetDescription>
        </ResponsiveSheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="policy-profile">Profile</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger id="policy-profile">
                  <SelectValue placeholder="Pick a profile" />
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

            <div className="space-y-2">
              <Label htmlFor="policy-name">Policy name</Label>
              <Input
                id="policy-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AIA Term Life 25"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as InsuranceType)}
              >
                <SelectTrigger id="policy-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSURANCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {INSURANCE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-insurer">Insurer</Label>
              <Input
                id="policy-insurer"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                placeholder="e.g. AIA, Great Eastern"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="policy-premium">Premium</Label>
                <CurrencyInput
                  id="policy-premium"
                  value={premiumAmount}
                  onChange={setPremiumAmount}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-frequency">Frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) =>
                    setFrequency(v as "monthly" | "yearly")
                  }
                >
                  <SelectTrigger id="policy-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-coverage">Coverage amount</Label>
              <CurrencyInput
                id="policy-coverage"
                value={coverageAmount}
                onChange={setCoverageAmount}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="policy-waiver" className="cursor-pointer">
                  Premium waiver
                </Label>
                <p className="text-xs text-muted-foreground">
                  Premiums waived on critical illness or disability
                </p>
              </div>
              <Switch
                id="policy-waiver"
                checked={premiumWaiver}
                onCheckedChange={setPremiumWaiver}
              />
            </div>
          </div>
        </ScrollArea>

        <ResponsiveSheetFooter className="border-t p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Add policy"
            )}
          </Button>
        </ResponsiveSheetFooter>
      </ResponsiveSheetContent>
    </ResponsiveSheet>
  )
}
