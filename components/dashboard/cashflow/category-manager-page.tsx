"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  Check,
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
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    initialCategories[0]?.id ?? null
  )
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [newRulePattern, setNewRulePattern] = useState("")

  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const activeRules = activeCategoryId
    ? rulesMap.get(activeCategoryId) ?? []
    : []

  function getRuleCount(categoryId: string): number {
    return rulesMap.get(categoryId)?.length ?? 0
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
      const created = await res.json()
      toast.success(`Created category "${newCategoryName.trim()}"`)
      setNewCategoryName("")
      setIsAddingCategory(false)
      await fetchCategories()
      setActiveCategoryId(created.id)
    } catch {
      toast.error("Failed to create category")
    }
  }

  async function handleSaveEdit() {
    if (!activeCategoryId || !editName.trim()) return
    if (isDuplicateName(editName, activeCategoryId)) {
      setNameError("A category with this name already exists")
      return
    }
    setNameError(null)
    try {
      const res = await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeCategoryId, name: editName.trim() }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to update category")
        return
      }
      toast.success("Category updated")
      setEditingName(false)
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
      setRulesMap((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      // Select the next available category
      const remaining = categories.filter((c) => c.id !== id)
      setActiveCategoryId(remaining[0]?.id ?? null)
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

  async function handleAddRule() {
    if (!activeCategoryId || !newRulePattern.trim()) return

    try {
      const res = await fetch("/api/categories/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          categoryId: activeCategoryId,
          matchPattern: newRulePattern.trim(),
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to add rule")
        return
      }

      const newRule = await res.json()
      toast.success(`Added rule "${newRulePattern.trim().toUpperCase()}"`)

      setRulesMap((prev) => {
        const next = new Map(prev)
        const rules = [...(next.get(activeCategoryId) ?? []), newRule]
        next.set(activeCategoryId, rules)
        return next
      })
      setNewRulePattern("")
    } catch {
      toast.error("Failed to add rule")
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2 sm:p-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/cashflow">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">
              Manage Spending Categories
            </h1>
            <p className="hidden text-muted-foreground sm:block">
              Select a category to view and edit its matching rules.
            </p>
          </div>
        </div>
      </div>

      {/* Main layout: left nav + right panel */}
      <Card>
        <CardHeader className="px-4 pb-4 sm:px-6">
          <CardTitle>Categories</CardTitle>
          <CardDescription className="hidden sm:block">
            Rules auto-classify transactions during import.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {categories.length > 0 && (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
              {/* Mobile: dropdown + add button */}
              <div className="flex items-center gap-2 lg:hidden">
                <Select
                  value={activeCategoryId ?? ""}
                  onValueChange={(id) => {
                    setActiveCategoryId(id)
                    setEditingName(false)
                    setNameError(null)
                    setNewRulePattern("")
                  }}
                >
                  <SelectTrigger className="h-10 flex-1">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => {
                      const rc = getRuleCount(c.id)
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            {c.name}
                            {c.is_system && (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            )}
                            {rc > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({rc})
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => {
                    setIsAddingCategory(true)
                    setNewCategoryName("")
                    setNameError(null)
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Desktop: left sidebar nav */}
              <div className="hidden w-64 shrink-0 flex-col gap-1 lg:flex">
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2 w-full"
                  onClick={() => {
                    setIsAddingCategory(true)
                    setNewCategoryName("")
                    setNameError(null)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Category
                </Button>
                <nav
                  className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto"
                  aria-label="Categories"
                >
                {categories.map((c) => {
                  const isActive = activeCategoryId === c.id
                  const ruleCount = getRuleCount(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setActiveCategoryId(c.id)
                        setEditingName(false)
                        setNameError(null)
                        setNewRulePattern("")
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                        isActive
                          ? "bg-muted font-medium text-foreground ring-1 ring-foreground/10"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.is_system && (
                        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      {ruleCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px] tabular-nums"
                        >
                          {ruleCount}
                        </Badge>
                      )}
                    </button>
                  )
                })}
                </nav>
              </div>

              {/* Right panel: category detail */}
              <div className="min-w-0 flex-1">
                {activeCategory ? (
                  <div className="space-y-6">
                    {/* Category name + actions */}
                    <div className="flex items-start justify-between gap-3">
                      {editingName ? (
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Input
                              value={editName}
                              onChange={(e) => {
                                setEditName(e.target.value)
                                setNameError(null)
                              }}
                              className={cn(
                                "h-9",
                                nameError && "border-destructive"
                              )}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveEdit()
                                if (e.key === "Escape") {
                                  setEditingName(false)
                                  setNameError(null)
                                }
                              }}
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 shrink-0"
                              onClick={handleSaveEdit}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 shrink-0"
                              onClick={() => {
                                setEditingName(false)
                                setNameError(null)
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          {nameError && (
                            <p className="text-xs text-destructive">
                              {nameError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold">
                            {activeCategory.name}
                          </h2>
                          {activeCategory.is_system && (
                            <Badge variant="outline" className="text-[10px]">
                              System
                            </Badge>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingName(true)
                              setEditName(activeCategory.name)
                              setNameError(null)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}

                      {!activeCategory.is_system && !editingName && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(activeCategory.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      )}
                    </div>

                    {/* Matching Rules section */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">
                          Matching Rules
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Keywords matched against transaction descriptions
                          during import. Wildcards supported (e.g.
                          GRAB*TRANSPORT).
                        </p>
                      </div>

                      {/* Add rule form — top on mobile for easy access */}
                      <div className="flex items-center gap-2">
                        <Input
                          value={newRulePattern}
                          onChange={(e) => setNewRulePattern(e.target.value)}
                          placeholder="Type a keyword (e.g. GRABFOOD)"
                          className="h-10 text-sm sm:h-9"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddRule()
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleAddRule}
                          disabled={!newRulePattern.trim()}
                          className="h-10 shrink-0 sm:h-9"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add
                        </Button>
                      </div>

                      {activeRules.length === 0 ? (
                        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                          No rules yet. Add keywords above or assign
                          transactions to this category to auto-learn patterns.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {activeRules.map((rule) => (
                            <div
                              key={rule.id}
                              className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 sm:py-1.5"
                            >
                              <code className="min-w-0 flex-1 truncate text-sm">
                                {rule.match_pattern}
                              </code>
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[10px]"
                              >
                                {rule.source}
                              </Badge>
                              {rule.source === "user" && (
                                <button
                                  className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                                  onClick={() =>
                                    handleDeleteRule(
                                      rule.id,
                                      activeCategory.id
                                    )
                                  }
                                >
                                  <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">
                      Select a category to view its rules.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {categories.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No categories yet. Click &quot;Add Category&quot; to create one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add category dialog */}
      <Dialog open={isAddingCategory} onOpenChange={setIsAddingCategory}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Category name</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value)
                setNameError(null)
              }}
              placeholder="e.g. Groceries"
              className={cn(nameError && "border-destructive")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory()
              }}
              autoFocus
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddingCategory(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
