"use client"

import { useState } from "react"
import { toast } from "sonner"
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

interface DeleteLoanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  loanId: string
  loanName: string
}

export function DeleteLoanDialog({
  open,
  onOpenChange,
  onSuccess,
  loanId,
  loanName,
}: DeleteLoanDialogProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/loans/${loanId}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({ error: "Failed to delete" }))
        throw new Error(err.error)
      }
      toast.success(`Deleted "${loanName}"`)
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete loan")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete loan</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &ldquo;{loanName}&rdquo;? This will
            also remove all associated repayments and CPF housing usage records.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
