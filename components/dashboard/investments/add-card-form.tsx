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
  CARD_TYPE_LABELS,
  type CollectibleCard,
} from "@/components/dashboard/investments/cards-tab"

const FRANCHISES = ["Pokemon", "Sports", "Yu-Gi-Oh", "MTG", "Other"] as const
const LANGUAGES = ["English", "Japanese", "Other"] as const
const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "TAG", "Other"] as const
const CONDITIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const

type AddCardFormProps = {
  readonly tabId: string
  readonly profileId: string | null
  readonly familyId: string | null
  readonly editItem?: CollectibleCard
  readonly onSuccess: () => void
}

export function AddCardForm({
  tabId,
  profileId,
  familyId,
  editItem,
  onSuccess,
}: AddCardFormProps) {
  const isEdit = editItem != null

  const [name, setName] = useState(editItem?.name ?? "")
  const [typeLabel, setTypeLabel] = useState(
    editItem?.type_label ?? "Graded/Slab",
  )
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
  const [setNameField, setSetNameField] = useState(editItem?.set_name ?? "")
  const [franchise, setFranchise] = useState(editItem?.franchise ?? "Pokemon")
  const [language, setLanguage] = useState(editItem?.language ?? "English")
  const [edition, setEdition] = useState(editItem?.edition ?? "")
  const [cardNumber, setCardNumber] = useState(editItem?.card_number ?? "")
  const [gradingCompany, setGradingCompany] = useState(
    editItem?.grading_company ?? "",
  )
  const [grade, setGrade] = useState(editItem?.grade?.toString() ?? "")
  const [certNumber, setCertNumber] = useState(editItem?.cert_number ?? "")
  const [condition, setCondition] = useState(editItem?.condition ?? "")
  const [rarity, setRarity] = useState(editItem?.rarity ?? "")
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
        ...(setNameField.trim() && { setName: setNameField.trim() }),
        ...(franchise && { franchise }),
        ...(language && { language }),
        ...(edition.trim() && { edition: edition.trim() }),
        ...(cardNumber.trim() && { cardNumber: cardNumber.trim() }),
        ...(gradingCompany && { gradingCompany }),
        ...(grade && { grade: Number.parseFloat(grade) }),
        ...(certNumber.trim() && { certNumber: certNumber.trim() }),
        ...(condition && { condition }),
        ...(rarity.trim() && { rarity: rarity.trim() }),
        ...(quantity && Number.parseInt(quantity) > 1 && { quantity: Number.parseInt(quantity) }),
        ...(notes.trim() && { notes: notes.trim() }),
      }

      const url = isEdit
        ? `/api/investments/cards/${editItem.id}`
        : "/api/investments/cards"
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
      {/* Simple fields */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="card-name">Name</Label>
          <Input
            id="card-name"
            placeholder='e.g. "Charizard VMAX PSA 10"'
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
              {CARD_TYPE_LABELS.map((label) => (
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

      {/* Expandable details */}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Set name</Label>
              <Input
                placeholder="e.g. Champion's Path"
                value={setNameField}
                onChange={(e) => setSetNameField(e.target.value)}
              />
            </div>
            <div>
              <Label>Card number</Label>
              <Input
                placeholder="e.g. 074/073"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Franchise</Label>
              <Select value={franchise} onValueChange={setFranchise}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRANCHISES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Edition</Label>
            <Input
              placeholder="e.g. 1st Edition, Unlimited"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Grading company</Label>
              <Select
                value={gradingCompany}
                onValueChange={setGradingCompany}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {GRADING_COMPANIES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grade (1-10)</Label>
              <Input
                type="number"
                step="0.5"
                min="1"
                max="10"
                placeholder="e.g. 9.5"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Certificate number</Label>
            <Input
              placeholder="Grading cert #"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Condition (raw cards)</Label>
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
              <Label>Rarity</Label>
              <Input
                placeholder="e.g. Ultra Rare"
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
              />
            </div>
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
