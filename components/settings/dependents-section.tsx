"use client"

import { useActionState, useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CurrencyInput } from "@/components/ui/currency-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ButtonSelect } from "@/components/ui/button-select"
import { Switch } from "@/components/ui/switch"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ui/responsive-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  createDependent,
  updateDependent,
  deleteDependent,
  type DependentState,
} from "@/app/(app)/settings/actions"

type Dependent = {
  id: string
  family_id: string
  name: string
  birth_year: number
  relationship: string
  claimed_by_profile_id: string | null
  in_full_time_education: boolean
  annual_income: number
  living_with_claimant: boolean
  is_handicapped: boolean
}

type ProfileOption = {
  id: string
  name: string
}

interface DependentsSectionProps {
  familyId: string
  profiles: ProfileOption[]
  initialDependents: Dependent[]
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  child: "Child",
  parent: "Parent",
  grandparent: "Grandparent",
}

export function DependentsSection({
  familyId,
  profiles,
  initialDependents,
}: DependentsSectionProps) {
  const [dependents, setDependents] = useState(initialDependents)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDependent, setEditingDependent] = useState<Dependent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Dependent | null>(null)

  // Form state
  const [formName, setFormName] = useState("")
  const [formBirthYear, setFormBirthYear] = useState(2020)
  const [formRelationship, setFormRelationship] = useState<string>("child")
  const [formClaimedBy, setFormClaimedBy] = useState<string>("")
  const [formEducation, setFormEducation] = useState(false)
  const [formIncome, setFormIncome] = useState(0)
  const [formLivingWith, setFormLivingWith] = useState(true)
  const [formHandicapped, setFormHandicapped] = useState(false)

  const currentYear = new Date().getFullYear()

  function resetForm() {
    setFormName("")
    setFormBirthYear(2020)
    setFormRelationship("child")
    setFormClaimedBy(profiles[0]?.id ?? "")
    setFormEducation(false)
    setFormIncome(0)
    setFormLivingWith(true)
    setFormHandicapped(false)
  }

  function openAdd() {
    setEditingDependent(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(dep: Dependent) {
    setEditingDependent(dep)
    setFormName(dep.name)
    setFormBirthYear(dep.birth_year)
    setFormRelationship(dep.relationship)
    setFormClaimedBy(dep.claimed_by_profile_id ?? "")
    setFormEducation(dep.in_full_time_education)
    setFormIncome(dep.annual_income)
    setFormLivingWith(dep.living_with_claimant)
    setFormHandicapped(dep.is_handicapped)
    setDialogOpen(true)
  }

  // Create action
  const [createState, createAction, isCreatePending] = useActionState(createDependent, {
    success: false,
  } as DependentState)

  // Update action
  const [updateState, updateAction, isUpdatePending] = useActionState(updateDependent, {
    success: false,
  } as DependentState)

  // Delete action
  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteDependent, {
    success: false,
  } as DependentState)

  const handleSave = useCallback(async () => {
    const fd = new FormData()
    fd.set("familyId", familyId)
    fd.set("name", formName)
    fd.set("birthYear", String(formBirthYear))
    fd.set("relationship", formRelationship)
    fd.set("claimedByProfileId", formClaimedBy)
    fd.set("inFullTimeEducation", String(formEducation))
    fd.set("annualIncome", String(formIncome))
    fd.set("livingWithClaimant", String(formLivingWith))
    fd.set("isHandicapped", String(formHandicapped))

    if (editingDependent) {
      fd.set("dependentId", editingDependent.id)
      updateAction(fd)
    } else {
      createAction(fd)
    }
  }, [
    familyId,
    formName,
    formBirthYear,
    formRelationship,
    formClaimedBy,
    formEducation,
    formIncome,
    formLivingWith,
    formHandicapped,
    editingDependent,
    createAction,
    updateAction,
  ])

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return
    const fd = new FormData()
    fd.set("dependentId", deleteTarget.id)
    fd.set("familyId", familyId)
    deleteAction(fd)
  }, [deleteTarget, familyId, deleteAction])

  async function fetchDependents() {
    try {
      const res = await fetch(`/api/dependents?familyId=${familyId}`)
      if (res.ok) {
        const data = await res.json()
        setDependents(data.dependents)
      }
    } catch {
      // silent
    }
  }

  // Handle create/update/delete success (sync during render)
  const [prevCreateState, setPrevCreateState] = useState(createState)
  if (createState !== prevCreateState) {
    setPrevCreateState(createState)
    if (createState.success) {
      toast.success("Dependent added")
      setDialogOpen(false)
      fetchDependents()
    } else if (createState.error) {
      toast.error(createState.error)
    }
  }

  const [prevUpdateState, setPrevUpdateState] = useState(updateState)
  if (updateState !== prevUpdateState) {
    setPrevUpdateState(updateState)
    if (updateState.success) {
      toast.success("Dependent updated")
      setDialogOpen(false)
      fetchDependents()
    } else if (updateState.error) {
      toast.error(updateState.error)
    }
  }

  const [prevDeleteState, setPrevDeleteState] = useState(deleteState)
  if (deleteState !== prevDeleteState) {
    setPrevDeleteState(deleteState)
    if (deleteState.success) {
      toast.success("Dependent removed")
      setDeleteTarget(null)
      fetchDependents()
    } else if (deleteState.error) {
      toast.error(deleteState.error)
    }
  }

  const isChild = formRelationship === "child"
  const isParentOrGrandparent =
    formRelationship === "parent" || formRelationship === "grandparent"
  const childAge = currentYear - formBirthYear

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Add children, parents, or grandparents for automatic tax relief calculation.
          </p>
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {dependents.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Birth Year</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Claimed By</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dependents.map((dep) => {
                const claimant = profiles.find(
                  (p) => p.id === dep.claimed_by_profile_id
                )
                return (
                  <TableRow key={dep.id}>
                    <TableCell className="font-medium">
                      {dep.name}
                      {dep.is_handicapped && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Handicapped
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{dep.birth_year}</TableCell>
                    <TableCell>
                      {RELATIONSHIP_LABELS[dep.relationship] ?? dep.relationship}
                    </TableCell>
                    <TableCell>{claimant?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(dep)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleteTarget(dep)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">
            No dependents added yet.
          </p>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDependent ? "Edit Dependent" : "Add Dependent"}
            </DialogTitle>
            <DialogDescription>
              {editingDependent
                ? "Update dependent details for tax relief calculation."
                : "Add a child, parent, or grandparent for automatic tax relief."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Sarah"
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Birth Year</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1920}
                  max={2040}
                  value={formBirthYear}
                  onChange={(e) => setFormBirthYear(Number(e.target.value) || 2020)}
                  className="h-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <ButtonSelect
                  value={formRelationship}
                  onValueChange={setFormRelationship}
                  options={[
                    { value: "child", label: "Child" },
                    { value: "parent", label: "Parent" },
                    { value: "grandparent", label: "Grandparent" },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Relief Claimed By</Label>
                <Select
                  value={formClaimedBy || "none"}
                  onValueChange={(v) => setFormClaimedBy(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Annual Income</Label>
              <CurrencyInput
                value={formIncome}
                onChange={(v) => setFormIncome(v ?? 0)}
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                {isChild
                  ? "Child income must be below $8,000 to qualify for QCR."
                  : "Parent income must be below $8,000 to qualify for relief."}
              </p>
            </div>

            {isChild && childAge >= 16 && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={formEducation}
                  onCheckedChange={setFormEducation}
                />
                <Label>Full-time education</Label>
                <span className="text-xs text-muted-foreground">
                  (Required for QCR when child is 16 or older)
                </span>
              </div>
            )}

            {isParentOrGrandparent && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={formLivingWith}
                  onCheckedChange={setFormLivingWith}
                />
                <Label>Living with claimant</Label>
                <span className="text-xs text-muted-foreground">
                  ($9,000 if living with, $5,500 if not)
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={formHandicapped}
                onCheckedChange={setFormHandicapped}
              />
              <Label>Handicapped</Label>
              <span className="text-xs text-muted-foreground">
                (Higher relief amount for handicapped dependents)
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formName.trim() || isCreatePending || isUpdatePending}
            >
              {(isCreatePending || isUpdatePending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingDependent ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove dependent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteTarget?.name} and any associated tax relief calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeletePending}>
              {isDeletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
