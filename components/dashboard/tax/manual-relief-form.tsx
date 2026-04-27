"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ImpactConfirmationDialog } from "@/components/ui/impact-confirmation-dialog"
import { useImpactConfirmation } from "@/hooks/use-impact-confirmation"

const RELIEF_TYPES = [
  { value: "srs", label: "SRS Contribution" },
  { value: "donations", label: "Donations (IPC)" },
  { value: "course_fees", label: "Course Fees" },
  { value: "cpf_topup_self", label: "CPF Top-up (Self)" },
  { value: "cpf_topup_family", label: "CPF Top-up (Family)" },
  { value: "parent", label: "Parent Relief" },
  { value: "spouse", label: "Spouse Relief" },
  { value: "qcr", label: "Qualifying Child Relief" },
  { value: "wmcr", label: "WMCR" },
  { value: "nsman", label: "NSman Relief" },
  { value: "other", label: "Other" },
] as const

export interface ManualReliefItem {
  id?: string
  profile_id: string
  year: number
  relief_type: string
  amount: number
}

interface ProfileOption {
  id: string
  name: string
}

interface ManualReliefFormProps {
  readonly year: number
  readonly profiles: ProfileOption[]
  readonly reliefs: ManualReliefItem[]
  readonly onSave: (reliefs: ManualReliefItem[]) => Promise<void>
}

export function ManualReliefForm({
  year,
  profiles,
  reliefs,
  onSave,
}: ManualReliefFormProps) {
  const [items, setItems] = useState<ManualReliefItem[]>(
    reliefs.length > 0 ? reliefs : []
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reliefImpact = useImpactConfirmation("tax.reliefs_manual")

  useEffect(() => {
    setItems(reliefs.length > 0 ? reliefs : [])
  }, [reliefs])

  function addItem() {
    const firstProfile = profiles[0]
    if (!firstProfile) return
    setItems([
      ...items,
      {
        profile_id: firstProfile.id,
        year,
        relief_type: "srs",
        amount: 0,
      },
    ])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(
    index: number,
    field: keyof ManualReliefItem,
    value: string | number
  ) {
    const updated = [...items]
    if (field === "profile_id") updated[index] = { ...updated[index], profile_id: value as string }
    else if (field === "relief_type") updated[index] = { ...updated[index], relief_type: value as string }
    else if (field === "amount") updated[index] = { ...updated[index], amount: typeof value === "number" ? value : Number(value) || 0 }
    setItems(updated)
  }

  async function handleSave() {
    setError(null)
    setIsLoading(true)
    try {
      const valid = items.filter((i) => i.amount > 0)
      await onSave(valid)
      toast.success("Manual reliefs saved")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Manual reliefs — YA {year}</h4>
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-1 size-4" />
          Add relief
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No manual reliefs. Add SRS, donations, CPF top-up, etc.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              key={`relief-${item.id ?? i}`}
              className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
            >
              {profiles.length > 1 && (
                <div className="min-w-[120px] space-y-1.5">
                  <Label>Profile</Label>
                  <Select
                    value={item.profile_id}
                    onValueChange={(v) => updateItem(i, "profile_id", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
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
              <div className="min-w-[140px] space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={item.relief_type}
                  onValueChange={(v) => updateItem(i, "relief_type", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELIEF_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[100px] space-y-1.5">
                <Label>Amount ($)</Label>
                <CurrencyInput
                  value={item.amount}
                  onChange={(v) => updateItem(i, "amount", v ?? 0)}
                  className="h-9"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-destructive"
                onClick={() => removeItem(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => reliefImpact.requestChange(handleSave)} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save reliefs
          </Button>
          <ImpactConfirmationDialog {...reliefImpact.dialogProps} />
        </div>
      )}
    </div>
  )
}
