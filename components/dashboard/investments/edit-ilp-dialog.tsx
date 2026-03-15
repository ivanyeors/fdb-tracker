"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"

interface EditIlpDialogProps {
  productId: string
  productName: string
  monthlyPremium: number
  endDate: string
  onSuccess?: () => void
}

export function EditIlpDialog({
  productId,
  productName,
  monthlyPremium,
  endDate,
  onSuccess,
}: EditIlpDialogProps) {
  const { activeFamilyId } = useActiveProfile()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(productName)
  const [premium, setPremium] = useState<number | null>(monthlyPremium)
  const [end, setEnd] = useState(
    endDate || new Date().toISOString().slice(0, 10),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const premiumVal = premium ?? 0
    if (premiumVal <= 0) {
      toast.error("Please enter a valid monthly premium.")
      return
    }
    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      toast.error("Please enter a valid end date (YYYY-MM-DD).")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/investments/ilp/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          monthlyPremium: premiumVal,
          endDate: end,
          ...(activeFamilyId && { familyId: activeFamilyId }),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to update")
      }

      toast.success("ILP product updated")
      setOpen(false)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit ILP — {productName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-ilp-name">Product name</Label>
            <Input
              id="edit-ilp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-ilp-premium">Monthly premium ($)</Label>
              <CurrencyInput
                id="edit-ilp-premium"
                value={premium}
                onChange={(v) => setPremium(v)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-ilp-end-date">Premium end date</Label>
              <Input
                id="edit-ilp-end-date"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
