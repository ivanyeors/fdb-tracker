"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Settings2,
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

interface CategoryWithMeta {
  id: string
  name: string
  icon: string | null
  sort_order: number
  is_system: boolean
  ruleCount: number
}

interface CategoryRule {
  id: string
  match_pattern: string
  category_id: string
  source: string
  priority: number
}

interface CategoryManagerProps {
  householdId: string
  onCategoriesChanged: () => void
}

export function CategoryManagerButton({
  householdId,
  onCategoriesChanged,
}: CategoryManagerProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="mr-2 h-4 w-4" />
        Manage Categories
      </Button>
      <CategoryManagerDialog
        open={open}
        onOpenChange={setOpen}
        householdId={householdId}
        onCategoriesChanged={onCategoriesChanged}
      />
    </>
  )
}

function CategoryManagerDialog({
  open,
  onOpenChange,
  householdId,
  onCategoriesChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  householdId: string
  onCategoriesChanged: () => void
}) {
  const [categories, setCategories] = useState<CategoryWithMeta[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [newName, setNewName] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    if (!householdId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/categories?householdId=${householdId}`)
      if (res.ok) {
        setCategories(await res.json())
      }
    } catch {
      toast.error("Failed to load categories")
    } finally {
      setIsLoading(false)
    }
  }, [householdId])

  useEffect(() => {
    if (open) fetchCategories()
  }, [open, fetchCategories])

  async function fetchRules(categoryId: string) {
    setRulesLoading(true)
    try {
      const res = await fetch(
        `/api/categories/rules?householdId=${householdId}&categoryId=${categoryId}`
      )
      if (res.ok) {
        setRules(await res.json())
      }
    } catch {
      toast.error("Failed to load rules")
    } finally {
      setRulesLoading(false)
    }
  }

  function handleExpand(categoryId: string) {
    if (expandedId === categoryId) {
      setExpandedId(null)
      setRules([])
    } else {
      setExpandedId(categoryId)
      fetchRules(categoryId)
    }
  }

  function isDuplicateName(name: string, excludeId?: string): boolean {
    const trimmed = name.trim().toLowerCase()
    return categories.some(
      (c) => c.name.toLowerCase() === trimmed && c.id !== excludeId
    )
  }

  async function handleAdd() {
    if (!newName.trim()) return
    if (isDuplicateName(newName)) {
      setNameError("A category with this name already exists")
      return
    }
    setNameError(null)
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, name: newName.trim() }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to create category")
        return
      }
      toast.success(`Created category "${newName.trim()}"`)
      setNewName("")
      setIsAdding(false)
      fetchCategories()
      onCategoriesChanged()
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
      onCategoriesChanged()
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
      fetchCategories()
      onCategoriesChanged()
    } catch {
      toast.error("Failed to delete category")
    }
  }

  async function handleDeleteRule(ruleId: string) {
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
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      fetchCategories()
    } catch {
      toast.error("Failed to delete rule")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Spending Categories</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat.id}>
                {/* Category row */}
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted/50",
                    expandedId === cat.id && "bg-muted/50"
                  )}
                >
                  {/* Expand toggle */}
                  <button
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => handleExpand(cat.id)}
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        expandedId === cat.id && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Name (editable or display) */}
                  {editingId === cat.id ? (
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1">
                        <Input
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value)
                            setNameError(null)
                          }}
                          className={cn("h-7 text-sm", nameError && "border-destructive")}
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
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleSaveEdit(cat.id)}
                        >
                          <Plus className="h-3.5 w-3.5 rotate-45" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingId(null)
                            setNameError(null)
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {nameError && (
                        <p className="text-xs text-destructive">{nameError}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat.name}</span>
                      {cat.is_system && (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                      {cat.ruleCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-xs tabular-nums"
                        >
                          {cat.ruleCount} rules
                        </Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingId(cat.id)
                          setEditName(cat.name)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!cat.is_system && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(cat.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Rules panel */}
                {expandedId === cat.id && (
                  <div className="mb-2 ml-8 space-y-1 border-l pl-3">
                    {rulesLoading ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        Loading rules...
                      </p>
                    ) : rules.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        No matching rules yet. Assign transactions to this
                        category to auto-learn patterns.
                      </p>
                    ) : (
                      rules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <code className="flex-1 rounded bg-muted px-1.5 py-0.5">
                            {rule.match_pattern}
                          </code>
                          <Badge variant="outline" className="text-[10px]">
                            {rule.source}
                          </Badge>
                          {rule.source === "user" && (
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add new category */}
        <div className="border-t pt-3">
          {isAdding ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    setNameError(null)
                  }}
                  placeholder="Category name"
                  className={cn("h-8 text-sm", nameError && "border-destructive")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd()
                    if (e.key === "Escape") setIsAdding(false)
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAdding(false)
                    setNewName("")
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
              className="w-full"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Delete confirmation */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the category and unassign all transactions
            currently using it. This action cannot be undone.
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
    </Dialog>
  )
}
