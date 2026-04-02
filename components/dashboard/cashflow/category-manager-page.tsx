"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Lock,
  X,
  ChevronDown,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Category {
  id: string
  name: string
  icon: string | null
  sort_order: number
  is_system: boolean
  created_at: string
}

interface CategoryRule {
  id: string
  match_pattern: string
  category_id: string
  source: string
  priority: number
  created_at: string
}

interface CategoryManagerPageProps {
  householdId: string
  initialCategories: Category[]
  initialRules: CategoryRule[]
}

export function CategoryManagerPage({
  householdId,
  initialCategories,
  initialRules,
}: CategoryManagerPageProps) {
  const [categories, setCategories] = useState(initialCategories)
  const [rulesMap, setRulesMap] = useState<Map<string, CategoryRule[]>>(() => {
    const map = new Map<string, CategoryRule[]>()
    for (const rule of initialRules) {
      const existing = map.get(rule.category_id) ?? []
      existing.push(rule)
      map.set(rule.category_id, existing)
    }
    return map
  })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [newRulePatterns, setNewRulePatterns] = useState<Map<string, string>>(
    new Map()
  )

  function getRuleCount(categoryId: string): number {
    return rulesMap.get(categoryId)?.length ?? 0
  }

  function toggleExpand(categoryId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  function isDuplicateName(name: string, excludeId?: string): boolean {
    const trimmed = name.trim().toLowerCase()
    return categories.some(
      (c) => c.name.toLowerCase() === trimmed && c.id !== excludeId
    )
  }

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`/api/categories?householdId=${householdId}`)
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      }
    } catch {
      toast.error("Failed to reload categories")
    }
  }, [householdId])

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    if (isDuplicateName(newCategoryName)) {
      setNameError("A category with this name already exists")
      return
    }
    setNameError(null)
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, name: newCategoryName.trim() }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to create category")
        return
      }
      toast.success(`Created category "${newCategoryName.trim()}"`)
      setNewCategoryName("")
      setIsAddingCategory(false)
      fetchCategories()
    } catch {
      toast.error("Failed to create category")
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return
    if (isDuplicateName(editName, id)) {
      setNameError("A category with this name already exists")
      return
    }
    setNameError(null)
    try {
      const res = await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: editName.trim() }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to update category")
        return
      }
      toast.success("Category updated")
      setEditingId(null)
      fetchCategories()
    } catch {
      toast.error("Failed to update category")
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to delete category")
        return
      }
      toast.success("Category deleted")
      setDeleteConfirm(null)
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setRulesMap((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      fetchCategories()
    } catch {
      toast.error("Failed to delete category")
    }
  }

  async function handleDeleteRule(ruleId: string, categoryId: string) {
    try {
      const res = await fetch("/api/categories/rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ruleId }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to delete rule")
        return
      }
      toast.success("Rule deleted")
      setRulesMap((prev) => {
        const next = new Map(prev)
        const rules = (next.get(categoryId) ?? []).filter(
          (r) => r.id !== ruleId
        )
        next.set(categoryId, rules)
        return next
      })
    } catch {
      toast.error("Failed to delete rule")
    }
  }

  async function handleAddRule(categoryId: string) {
    const pattern = newRulePatterns.get(categoryId)?.trim()
    if (!pattern) return

    try {
      const res = await fetch("/api/categories/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          categoryId,
          matchPattern: pattern,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to add rule")
        return
      }

      const newRule = await res.json()
      toast.success(`Added rule "${pattern.toUpperCase()}"`)

      setRulesMap((prev) => {
        const next = new Map(prev)
        const rules = [...(next.get(categoryId) ?? []), newRule]
        next.set(categoryId, rules)
        return next
      })
      setNewRulePatterns((prev) => {
        const next = new Map(prev)
        next.delete(categoryId)
        return next
      })
    } catch {
      toast.error("Failed to add rule")
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2 sm:p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/cashflow">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold">
              Manage Spending Categories
            </h1>
          </div>
          <p className="ml-11 text-muted-foreground">
            Create categories and define keyword rules that automatically
            classify transactions during import.
          </p>
        </div>
      </div>

      {/* Add Category */}
      <div>
        {isAddingCategory ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value)
                  setNameError(null)
                }}
                placeholder="Category name"
                className={cn("h-9 max-w-sm", nameError && "border-destructive")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCategory()
                  if (e.key === "Escape") {
                    setIsAddingCategory(false)
                    setNewCategoryName("")
                    setNameError(null)
                  }
                }}
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAddingCategory(false)
                  setNewCategoryName("")
                  setNameError(null)
                }}
              >
                Cancel
              </Button>
            </div>
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddingCategory(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        )}
      </div>

      {/* Category List */}
      <div className="space-y-2">
        {categories.map((cat) => {
          const isExpanded = expandedIds.has(cat.id)
          const rules = rulesMap.get(cat.id) ?? []
          const ruleCount = getRuleCount(cat.id)
          const rulePattern = newRulePatterns.get(cat.id) ?? ""

          return (
            <Card key={cat.id}>
              <CardContent className="p-0">
                {/* Category header row */}
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    isExpanded && "border-b"
                  )}
                >
                  <button
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleExpand(cat.id)}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>

                  {editingId === cat.id ? (
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value)
                            setNameError(null)
                          }}
                          className={cn(
                            "h-8 max-w-sm text-sm",
                            nameError && "border-destructive"
                          )}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(cat.id)
                            if (e.key === "Escape") {
                              setEditingId(null)
                              setNameError(null)
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveEdit(cat.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null)
                            setNameError(null)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {nameError && (
                        <p className="text-xs text-destructive">{nameError}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <button
                        className="flex-1 text-left text-sm font-medium"
                        onClick={() => toggleExpand(cat.id)}
                      >
                        {cat.name}
                      </button>
                      {cat.is_system && (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {ruleCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-xs tabular-nums"
                        >
                          {ruleCount} {ruleCount === 1 ? "rule" : "rules"}
                        </Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingId(cat.id)
                          setEditName(cat.name)
                          setNameError(null)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!cat.is_system && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(cat.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Expanded rules panel */}
                {isExpanded && (
                  <div className="space-y-2 px-4 py-3 pl-11">
                    {rules.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No matching rules yet. Add keywords below or assign
                        transactions to this category to auto-learn patterns.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {rules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center gap-2"
                          >
                            <code className="rounded bg-muted px-2 py-0.5 text-sm">
                              {rule.match_pattern}
                            </code>
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                            >
                              {rule.source}
                            </Badge>
                            {rule.source === "user" && (
                              <button
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  handleDeleteRule(rule.id, cat.id)
                                }
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add rule input */}
                    <div className="flex items-center gap-2 pt-2">
                      <Input
                        value={rulePattern}
                        onChange={(e) =>
                          setNewRulePatterns((prev) => {
                            const next = new Map(prev)
                            next.set(cat.id, e.target.value)
                            return next
                          })
                        }
                        placeholder="Type a keyword (e.g. GRABFOOD)"
                        className="h-8 max-w-sm text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddRule(cat.id)
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddRule(cat.id)}
                        disabled={!rulePattern.trim()}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add Rule
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        {categories.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the category and unassign all transactions currently
            using it. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
