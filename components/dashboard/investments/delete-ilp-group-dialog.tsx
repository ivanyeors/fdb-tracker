"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "@/components/ui/responsive-dialog"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface DeleteIlpGroupDialogProps {
  groupId: string
  groupName: string
  fundCount: number
  /** When provided, called instead of navigating to /dashboard/investments */
  onDeleted?: () => void
}

export function DeleteIlpGroupDialog({
  groupId,
  groupName,
  fundCount,
  onDeleted,
}: DeleteIlpGroupDialogProps) {
  const { activeFamilyId } = useActiveProfile()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/investments/ilp/groups/${groupId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(activeFamilyId && { familyId: activeFamilyId }),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to delete fund group")
      }

      toast.success("Fund group and all its funds removed")
      setOpen(false)
      if (onDeleted) {
        onDeleted()
      } else {
        router.push("/dashboard/investments?tab=ilp")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete group ${groupName}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete fund group?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{groupName}</span> and
            all {fundCount} {fundCount === 1 ? "fund" : "funds"} in it will be
            permanently removed, including their monthly value history. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
