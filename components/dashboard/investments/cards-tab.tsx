"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ChartSkeleton } from "@/components/loading"
import { formatCurrency } from "@/lib/utils"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { AddCardForm } from "@/components/dashboard/investments/add-card-form"

export const CARD_TYPE_LABELS = [
  "Graded/Slab",
  "Raw Card",
  "Booster Box",
  "ETB",
  "Bundle",
  "Case",
  "UPC",
  "Tin/Collection",
  "Other Sealed",
] as const

export type CardTypeLabel = (typeof CARD_TYPE_LABELS)[number]

export type CollectibleCard = {
  id: string
  family_id: string
  profile_id: string
  tab_id: string
  name: string
  type_label: string
  purchase_price: number
  current_value: number | null
  value_updated_at: string | null
  set_name: string | null
  franchise: string | null
  language: string | null
  edition: string | null
  card_number: string | null
  grading_company: string | null
  grade: number | null
  cert_number: string | null
  condition: string | null
  rarity: string | null
  quantity: number
  purchase_date: string | null
  notes: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

function pnl(item: CollectibleCard) {
  if (item.current_value == null) return null
  const cost = item.purchase_price * item.quantity
  return item.current_value * item.quantity - cost
}

function pnlPct(item: CollectibleCard) {
  if (item.current_value == null) return null
  const cost = item.purchase_price * item.quantity
  if (cost === 0) return null
  return ((item.current_value * item.quantity - cost) / cost) * 100
}

type CardsTabProps = {
  readonly tabId: string
  readonly items: CollectibleCard[]
  readonly isLoading: boolean
  readonly profileId: string | null
  readonly familyId: string | null
  readonly onMutation: () => void
}

export function CardsTab({
  tabId,
  items,
  isLoading,
  profileId,
  familyId,
  onMutation,
}: CardsTabProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<CollectibleCard | null>(null)
  const [deleteItem, setDeleteItem] = useState<CollectibleCard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState<string>("All")

  const filtered = useMemo(() => {
    if (filter === "All") return items
    return items.filter((i) => i.type_label === filter)
  }, [items, filter])

  const summary = useMemo(() => {
    const totalCost = items.reduce(
      (s, i) => s + i.purchase_price * i.quantity,
      0,
    )
    const totalValue = items.reduce(
      (s, i) => s + (i.current_value ?? i.purchase_price) * i.quantity,
      0,
    )
    const totalItems = items.reduce((s, i) => s + i.quantity, 0)
    const gain = totalValue - totalCost
    const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0
    return { totalItems, totalCost, totalValue, gain, gainPct }
  }, [items])

  const handleDelete = useCallback(async () => {
    if (!deleteItem) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/investments/cards/${deleteItem.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success(`Deleted "${deleteItem.name}"`)
      setDeleteItem(null)
      onMutation()
    } catch {
      toast.error("Failed to delete item")
    } finally {
      setDeleting(false)
    }
  }, [deleteItem, onMutation])

  const activeLabels = useMemo(() => {
    const set = new Set(items.map((i) => i.type_label))
    return CARD_TYPE_LABELS.filter((l) => set.has(l))
  }, [items])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("All")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === "All"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            All ({items.length})
          </button>
          {activeLabels.map((label) => {
            const count = items.filter((i) => i.type_label === label).length
            return (
              <button
                key={label}
                type="button"
                onClick={() => setFilter(label)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === label
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          Add item
        </Button>
      </div>

      {/* Summary bar */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-4 rounded-lg border bg-card p-3 text-sm">
          <div>
            <span className="text-muted-foreground">Items: </span>
            <span className="font-medium">{summary.totalItems}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total cost: </span>
            <span className="font-medium">
              ${formatCurrency(summary.totalCost)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Current value: </span>
            <span className="font-medium">
              ${formatCurrency(summary.totalValue)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">P&L: </span>
            <span
              className={`font-medium ${
                summary.gain > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : summary.gain < 0
                    ? "text-red-600 dark:text-red-400"
                    : ""
              }`}
            >
              {summary.gain >= 0 ? "+" : ""}${formatCurrency(summary.gain)} (
              {summary.gainPct >= 0 ? "+" : ""}
              {summary.gainPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      )}

      {/* Item list */}
      {isLoading ? (
        <ChartSkeleton height={256} className="rounded-xl" />
      ) : filtered.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
          {items.length === 0
            ? "No items yet. Use Add item to get started."
            : "No items match this filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const itemPnl = pnl(item)
            const itemPnlPct = pnlPct(item)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{item.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {item.type_label}
                    </Badge>
                    {item.quantity > 1 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        x{item.quantity}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {item.grading_company && item.grade != null && (
                      <span>
                        {item.grading_company} {item.grade}
                      </span>
                    )}
                    {item.condition && <span>{item.condition}</span>}
                    {item.set_name && <span>{item.set_name}</span>}
                    {item.purchase_date && <span>{item.purchase_date}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-4">
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {item.current_value != null
                        ? `$${formatCurrency(item.current_value * item.quantity)}`
                        : `$${formatCurrency(item.purchase_price * item.quantity)}`}
                    </div>
                    {itemPnl != null ? (
                      <div
                        className={`text-xs ${
                          itemPnl > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : itemPnl < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {itemPnl >= 0 ? "+" : ""}${formatCurrency(itemPnl)}
                        {itemPnlPct != null &&
                          ` (${itemPnlPct >= 0 ? "+" : ""}${itemPnlPct.toFixed(1)}%)`}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Cost: ${formatCurrency(item.purchase_price * item.quantity)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setEditItem(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => setDeleteItem(item)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle>Add card / sealed product</SheetTitle>
            <SheetDescription>
              Fill in the basics. Expand "More details" for grading, condition,
              and set info.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <AddCardForm
              tabId={tabId}
              profileId={profileId}
              familyId={familyId}
              onSuccess={() => {
                onMutation()
                setAddOpen(false)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet
        open={editItem != null}
        onOpenChange={(open) => {
          if (!open) setEditItem(null)
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle>Edit item</SheetTitle>
            <SheetDescription>Update details for this item.</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            {editItem && (
              <AddCardForm
                tabId={tabId}
                profileId={profileId}
                familyId={familyId}
                editItem={editItem}
                onSuccess={() => {
                  onMutation()
                  setEditItem(null)
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteItem != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteItem(null)
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteItem?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
