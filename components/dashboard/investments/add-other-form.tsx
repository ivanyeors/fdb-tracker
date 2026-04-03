"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { DatePicker } from "@/components/ui/date-picker"
import { Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import {
  OTHER_TYPE_LABELS,
  type CollectibleOther,
} from "@/components/dashboard/investments/others-tab"

const CONDITIONS = ["New/Sealed", "Like New", "Used"] as const

type AddOtherFormProps = {
  tabId: string
  profileId: string | null
  familyId: string | null
  editItem?: CollectibleOther
  onSuccess: () => void
}

export function AddOtherForm({
  tabId,
  profileId,
  familyId,
  editItem,
  onSuccess,
}: AddOtherFormProps) {
  const isEdit = editItem != null

  const [name, setName] = useState(editItem?.name ?? "")
  const [typeLabel, setTypeLabel] = useState(editItem?.type_label ?? "Other")
  const [purchasePrice, setPurchasePrice] = useState<number | null>(
    editItem?.purchase_price ?? null,
  )
  const [currentValue, setCurrentValue] = useState<number | null>(
    editItem?.current_value ?? null,
  )
  const [purchaseDate, setPurchaseDate] = useState<string | null>(
    editItem?.purchase_date ?? null,
  )

  // Detailed fields
  const [showDetails, setShowDetails] = useState(false)
  const [brand, setBrand] = useState(editItem?.brand ?? "")
  const [description, setDescription] = useState(editItem?.description ?? "")
  const [condition, setCondition] = useState(editItem?.condition ?? "")
  const [quantity, setQuantity] = useState(editItem?.quantity?.toString() ?? "1")
  const [notes, setNotes] = useState(editItem?.notes ?? "")

  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    if (purchasePrice == null || purchasePrice < 0) {
      toast.error("Purchase price is required")
      return
    }
    if (!profileId || !familyId) {
      toast.error("Please select a profile first")
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        tabId,
        profileId,
        familyId,
        name: name.trim(),
        typeLabel,
        purchasePrice,
        ...(currentValue != null && { currentValue }),
        ...(purchaseDate && { purchaseDate }),
        ...(brand.trim() && { brand: brand.trim() }),
        ...(description.trim() && { description: description.trim() }),
        ...(condition && { condition }),
        ...(quantity && parseInt(quantity) > 1 && { quantity: parseInt(quantity) }),
        ...(notes.trim() && { notes: notes.trim() }),
      }

      const url = isEdit
        ? `/api/investments/others/${editItem.id}`
        : "/api/investments/others"
      const method = isEdit ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(
          typeof err.error === "string" ? err.error : "Failed to save",
        )
      }

      toast.success(isEdit ? "Item updated" : "Item added")
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-3">
        <div>
          <Label htmlFor="other-name">Name</Label>
          <Input
            id="other-name"
            placeholder='e.g. "LEGO Millennium Falcon 75192"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <Label>Type</Label>
          <Select value={typeLabel} onValueChange={setTypeLabel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OTHER_TYPE_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Amount invested (SGD)</Label>
          <CurrencyInput
            value={purchasePrice}
            onChange={setPurchasePrice}
            placeholder="0.00"
          />
        </div>

        <div>
          <Label>Current value (SGD)</Label>
          <CurrencyInput
            value={currentValue}
            onChange={setCurrentValue}
            placeholder="0.00"
          />
        </div>

        <div>
          <Label>Purchase date</Label>
          <DatePicker value={purchaseDate} onChange={setPurchaseDate} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {showDetails ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
        More details
      </button>

      {showDetails && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div>
            <Label>Brand</Label>
            <Input
              placeholder='e.g. "LEGO", "Rolex"'
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>

          <div>
            <Label>Description</Label>
            <Input
              placeholder="Brief description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Input
              placeholder="Free-form notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Saving...
          </>
        ) : isEdit ? (
          "Update item"
        ) : (
          "Add item"
        )}
      </Button>
    </form>
  )
}
