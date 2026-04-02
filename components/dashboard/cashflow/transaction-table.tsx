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
import { Save } from "lucide-react"
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

interface TransactionTableProps {
  transactions: Transaction[]
  categories: Category[]
  onSaved?: () => void
}

export function TransactionTable({
  transactions,
  categories,
  onSaved,
}: TransactionTableProps) {
  const [changes, setChanges] = useState<Map<string, string | null>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges = changes.size > 0

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

  async function handleSave() {
    if (!hasChanges) return
    setIsSaving(true)

    try {
      const updates = Array.from(changes.entries()).map(([id, categoryId]) => ({
        id,
        categoryId,
      }))

      // Auto-extract merchant keywords for category rules
      const categoryRules: Array<{ pattern: string; categoryId: string }> = []
      for (const [id, categoryId] of changes.entries()) {
        if (!categoryId) continue
        const txn = transactions.find((t) => t.id === id)
        if (!txn) continue
        const keyword = extractMerchantKeyword(txn.description)
        if (keyword) {
          categoryRules.push({ pattern: keyword, categoryId })
        }
      }

      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, categoryRules }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to save changes")
        return
      }

      toast.success(`Updated ${updates.length} transactions`)
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
      <div className="flex items-center gap-2">
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
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(txn.txn_date + "T00:00:00").toLocaleDateString(
                      "en-SG",
                      { day: "2-digit", month: "short" },
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
                          v === "uncategorized" ? null : v,
                        )
                      }
                    >
                      <SelectTrigger
                        className={cn(
                          "h-8 text-xs",
                          isChanged && "border-blue-500",
                        )}
                      >
                        <SelectValue />
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
                        : "text-red-600",
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
  let cleaned = description
    .replace(/^(DEBIT PURCHASE|FAST PAYMENT|BILL PAYMENT INB?|NETS QR|GIRO|FUND TRANSFER|IBG GIRO)\s*/i, "")
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
