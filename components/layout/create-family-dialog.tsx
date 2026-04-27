"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ui/responsive-dialog"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface CreateFamilyDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onCreated: (family: { id: string; name: string }) => void
}

export function CreateFamilyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateFamilyDialogProps) {
  const [name, setName] = useState("")
  const [userCount, setUserCount] = useState("1")
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), userCount: Number(userCount) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create family")
        return
      }
      toast.success("Family created — add members in Settings > Users")
      setName("")
      setUserCount("1")
      onOpenChange(false)
      onCreated(data)
    } catch {
      toast.error("Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Family</DialogTitle>
          <DialogDescription>
            Create a new family group. You can add members later in Settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 px-4 md:px-0">
          <div className="grid gap-2">
            <Label htmlFor="family-name">Family Name</Label>
            <Input
              id="family-name"
              placeholder="e.g. Smith Family"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-count">Number of Members</Label>
            <Select
              value={userCount}
              onValueChange={setUserCount}
              disabled={saving}
            >
              <SelectTrigger id="user-count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {n === 1 ? "person" : "people"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="w-full md:w-auto"
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create Family
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
