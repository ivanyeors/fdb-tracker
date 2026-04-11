"use client"

import { useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Plus, Save, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils"

interface Transaction {
  id: string
  txn_date: string
  description: string
  amount: number
  txn_type: "debit" | "credit"
  statement_type: "bank" | "cc"
  category_id: string | null
  exclude_from_spending: boolean
  outflow_categories?: {
    id: string
    name: string
    icon: string | null
  } | null
}

interface Category {
  id: string
  name: string
  icon: string | null
}

export interface CategoryRule {
  match_pattern: string
  category_id: string
  source: string
  priority: number
}

interface TransactionTableProps {
  transactions: Transaction[]
  categories: Category[]
  categoryRules?: CategoryRule[]
  onSaved?: () => void
}

/**
 * Match a description against category rules (same logic as server-side categorizeTransaction).
 * Returns the best-matching category_id or null.
 */
function suggestCategory(
  description: string,
  rules: CategoryRule[]
): string | null {
  const desc = description.toUpperCase()

  // Sort by priority descending
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    const pattern = rule.match_pattern.toUpperCase()
    if (pattern.includes("*")) {
      // Wildcard matching
      const parts = pattern.split("*").filter(Boolean)
      if (parts.every((part) => desc.includes(part))) {
        return rule.category_id
      }
    } else if (desc.includes(pattern)) {
      return rule.category_id
    }
  }
  return null
}

function QuickCategorizePopover({
  transaction,
  categories,
  onSaved,
}: {
  transaction: Transaction
  categories: Category[]
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  )
  const [rulePattern, setRulePattern] = useState(
    () => extractMerchantKeyword(transaction.description) ?? ""
  )
  const [isSaving, setIsSaving] = useState(false)

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (!newOpen) {
      setSelectedCategoryId(null)
      setRulePattern(extractMerchantKeyword(transaction.description) ?? "")
    }
  }

  async function handleQuickSave() {
    if (!selectedCategoryId) return
    setIsSaving(true)
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ id: transaction.id, categoryId: selectedCategoryId }],
          categoryRules: rulePattern.trim()
            ? [{ pattern: rulePattern.trim(), categoryId: selectedCategoryId }]
            : [],
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to save")
        return
      }
      const catName =
        categories.find((c) => c.id === selectedCategoryId)?.name ?? "?"
      if (rulePattern.trim()) {
        toast.success(
          `Categorized as ${catName}. Rule learned: "${rulePattern.trim().toUpperCase()}"`
        )
      } else {
        toast.success(`Categorized as ${catName}`)
      }
      setOpen(false)
      onSaved?.()
    } catch {
      toast.error("Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Quick Categorize</PopoverTitle>
        </PopoverHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select
              value={selectedCategoryId ?? ""}
              onValueChange={setSelectedCategoryId}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Auto-categorize rule</Label>
            <Input
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              placeholder="e.g. GRABFOOD"
              className="h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickSave()
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Future matching transactions auto-categorized
            </p>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={handleQuickSave}
            disabled={!selectedCategoryId || isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TransactionTable({
  transactions,
  categories,
  categoryRules = [],
  onSaved,
}: TransactionTableProps) {
  const [changes, setChanges] = useState<Map<string, string | null>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges = changes.size > 0

  // Pre-compute suggestions for uncategorized transactions
  const suggestions = useMemo(() => {
    if (categoryRules.length === 0) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const txn of transactions) {
      if (txn.category_id) continue // already categorized
      const suggested = suggestCategory(txn.description, categoryRules)
      if (suggested) map.set(txn.id, suggested)
    }
    return map
  }, [transactions, categoryRules])

  function handleCategoryChange(txnId: string, categoryId: string | null) {
    setChanges((prev) => {
      const next = new Map(prev)
      next.set(txnId, categoryId)
      return next
    })
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(transactions.map((t) => t.id)))
    } else {
      setSelected(new Set())
    }
  }

  function handleBulkCategory(categoryId: string) {
    const next = new Map(changes)
    for (const id of selected) {
      next.set(id, categoryId)
    }
    setChanges(next)
  }

  function handleApplySuggestions() {
    const next = new Map(changes)
    for (const [id, categoryId] of suggestions) {
      if (!changes.has(id)) {
        next.set(id, categoryId)
      }
    }
    setChanges(next)
    toast.success(`Applied ${suggestions.size} category suggestions`)
  }

  async function handleSave() {
    if (!hasChanges) return
    setIsSaving(true)

    try {
      const updates = Array.from(changes.entries()).map(([id, categoryId]) => ({
        id,
        categoryId,
      }))

      // Auto-extract merchant keywords for category rules
      const categoryRulesPayload: Array<{
        pattern: string
        categoryId: string
      }> = []
      for (const [id, categoryId] of changes.entries()) {
        if (!categoryId) continue
        const txn = transactions.find((t) => t.id === id)
        if (!txn) continue
        const keyword = extractMerchantKeyword(txn.description)
        if (keyword) {
          categoryRulesPayload.push({ pattern: keyword, categoryId })
        }
      }

      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
          categoryRules: categoryRulesPayload,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to save changes")
        return
      }

      // Show rule learning feedback
      if (categoryRulesPayload.length > 0) {
        const ruleNames = categoryRulesPayload
          .slice(0, 3)
          .map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId)
            return `${r.pattern} → ${cat?.name ?? "?"}`
          })
          .join(", ")
        const suffix =
          categoryRulesPayload.length > 3
            ? ` +${categoryRulesPayload.length - 3} more`
            : ""
        toast.success(
          `Updated ${updates.length} transactions. Rules learned: ${ruleNames}${suffix}`
        )
      } else {
        toast.success(`Updated ${updates.length} transactions`)
      }

      setChanges(new Map())
      setSelected(new Set())
      onSaved?.()
    } catch {
      toast.error("Failed to save changes")
    } finally {
      setIsSaving(false)
    }
  }

  const getCategoryForTxn = (txn: Transaction) => {
    if (changes.has(txn.id)) {
      const changedId = changes.get(txn.id)
      return categories.find((c) => c.id === changedId) ?? null
    }
    return txn.outflow_categories ?? null
  }

  const summary = useMemo(() => {
    const byCategory = new Map<string, { count: number; total: number }>()
    for (const txn of transactions) {
      if (txn.exclude_from_spending || txn.txn_type === "credit") continue
      const cat = getCategoryForTxn(txn)
      const name = cat?.name ?? "Uncategorized"
      const existing = byCategory.get(name) ?? { count: 0, total: 0 }
      existing.count++
      existing.total += Math.abs(txn.amount)
      byCategory.set(name, existing)
    }
    return Array.from(byCategory.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, changes])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {selected.size > 0 && (
          <Select onValueChange={(v) => handleBulkCategory(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={`Set category (${selected.size})`} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {suggestions.size > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleApplySuggestions}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Apply {suggestions.size} suggestions
          </Button>
        )}
        {hasChanges && (
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            Save {changes.size} changes
          </Button>
        )}
      </div>

      {/* Transaction Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    selected.size === transactions.length &&
                    transactions.length > 0
                  }
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="w-24">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[180px]">Category</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((txn) => {
              const cat = getCategoryForTxn(txn)
              const isExcluded = txn.exclude_from_spending
              const isChanged = changes.has(txn.id)
              const suggestedCatId = suggestions.get(txn.id)
              const suggestedCat = suggestedCatId
                ? categories.find((c) => c.id === suggestedCatId)
                : null

              return (
                <TableRow
                  key={txn.id}
                  className={cn(isExcluded && "opacity-50")}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(txn.id)}
                      onCheckedChange={(checked: boolean) => {
                        const next = new Set(selected)
                        if (checked) next.add(txn.id)
                        else next.delete(txn.id)
                        setSelected(next)
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(txn.txn_date + "T00:00:00").toLocaleDateString(
                      "en-SG",
                      { day: "2-digit", month: "short" }
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{txn.description}</span>
                      {txn.statement_type === "cc" && (
                        <Badge variant="secondary" className="text-xs">
                          CC
                        </Badge>
                      )}
                      {isExcluded && (
                        <Badge variant="outline" className="text-xs">
                          excluded
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={cat?.id ?? "uncategorized"}
                      onValueChange={(v) =>
                        handleCategoryChange(
                          txn.id,
                          v === "uncategorized" ? null : v
                        )
                      }
                    >
                      <SelectTrigger
                        className={cn(
                          "h-8 text-xs",
                          isChanged && "border-blue-500",
                          !cat &&
                            suggestedCat &&
                            !isChanged &&
                            "border-dashed border-amber-400"
                        )}
                      >
                        <SelectValue
                          placeholder={
                            suggestedCat
                              ? `${suggestedCat.name} (suggested)`
                              : undefined
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uncategorized">
                          Uncategorized
                        </SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm",
                      txn.txn_type === "credit"
                        ? "text-green-600"
                        : "text-red-600"
                    )}
                  >
                    {txn.txn_type === "credit" ? "+" : ""}
                    {formatCurrency(txn.amount)}
                  </TableCell>
                </TableRow>
              )
            })}
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No transactions found. Upload a statement to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      {summary.length > 0 && (
        <div className="rounded-md border p-4">
          <h4 className="mb-3 text-sm font-medium">Spending by Category</h4>
          <div className="space-y-2">
            {summary.map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between text-sm"
              >
                <span>{row.name}</span>
                <span className="text-muted-foreground">
                  {row.count} txns &middot; {formatCurrency(row.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Extract a merchant keyword from a transaction description for category rule learning.
 * E.g. "FAST PAYMENT to DONER KEBAB TURK OTHR-Food" → "DONER KEBAB"
 * E.g. "DEBIT PURCHASE 05/01/26 xx-9315 Grab*" → "Grab"
 * E.g. "NETS QR 92462101 NETS QR PURCHASE TADA MOBILITY SIN" → "TADA MOBILITY"
 */
function extractMerchantKeyword(description: string): string | null {
  // Remove common prefixes
  const cleaned = description
    .replace(
      /^(DEBIT PURCHASE|FAST PAYMENT|BILL PAYMENT INB?|NETS QR|GIRO|FUND TRANSFER|IBG GIRO)\s*/i,
      ""
    )
    .replace(/\d{2}\/\d{2}\/\d{2}\s*/g, "") // dates
    .replace(/xx-\d{4}\s*/g, "") // card refs
    .replace(/\d{8,}\s*/g, "") // reference numbers
    .replace(/via PayNow[^\s]*\s*/gi, "")
    .replace(/(to|from)\s+/gi, "")
    .replace(/OTHR[-\s].*/i, "") // purpose codes
    .replace(/SALA\s*/i, "")
    .replace(/-\d{4}\s+/g, "") // terminal prefix
    .replace(/XXXX-XXXX-XXXX-\d{4}/g, "") // card suffix
    .replace(/SINGAPORE\s+SG/gi, "")
    .replace(/\bSG\b/g, "")
    .replace(/[A-Z]-[A-Z0-9]{10,}/g, "") // long reference codes
    .trim()

  // Take first 2-3 meaningful words
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1)
  if (words.length === 0) return null

  const keyword = words.slice(0, 3).join(" ").trim()
  return keyword.length >= 3 ? keyword : null
}
