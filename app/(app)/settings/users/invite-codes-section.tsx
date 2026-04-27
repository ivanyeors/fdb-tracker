"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Copy, Loader2, Trash2, Link } from "lucide-react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type InviteCode = {
  id: string
  code: string
  targetProfileId: string | null
  expiresAt: string
  createdAt: string
  botUrl: string | null
}

type UnlinkedProfile = {
  id: string
  name: string
}

export function InviteCodesSection({
  unlinkedProfiles,
}: {
  readonly unlinkedProfiles: UnlinkedProfile[]
}) {
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string>("any")
  const [deleteCodeId, setDeleteCodeId] = useState<string | null>(null)

  async function fetchCodes() {
    try {
      const res = await fetch("/api/invite-codes")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setCodes(data)
    } catch {
      toast.error("Failed to load invite codes")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCodes()
  }, [])

  async function handleCreate() {
    setCreating(true)
    try {
      const body: Record<string, string> = {}
      if (selectedProfileId && selectedProfileId !== "any") {
        body.targetProfileId = selectedProfileId
      }
      const res = await fetch("/api/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("Failed to create")
      toast.success("Invite code created")
      setSelectedProfileId("any")
      fetchCodes()
    } catch {
      toast.error("Failed to create invite code")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/invite-codes/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Invite code deleted")
      fetchCodes()
    } catch {
      toast.error("Failed to delete invite code")
    }
  }

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success("Code copied")
  }

  function getProfileName(profileId: string | null): string {
    if (!profileId) return "Any"
    const profile = unlinkedProfiles.find((p) => p.id === profileId)
    return profile?.name ?? "Unknown"
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Invite Codes</CardTitle>
          <CardDescription>
            Generate invite codes to add new users to your household. Share the
            code with the user — they can use /join in the Telegram bot or open
            the bot link to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create form */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/50 p-4">
            {unlinkedProfiles.length > 0 && (
              <div className="min-w-[180px] space-y-2">
                <label className="text-sm font-medium">
                  Target profile (optional)
                </label>
                <Select
                  value={selectedProfileId}
                  onValueChange={setSelectedProfileId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any unlinked profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any unlinked profile</SelectItem>
                    {unlinkedProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Invite Code
            </Button>
          </div>

          {/* Codes table */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active invite codes. Generate one above.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">Active invite codes</h4>
                <Badge variant="secondary">{codes.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Target Profile</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Bot Link</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs tracking-wider">
                            {c.code}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleCopyCode(c.code)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{getProfileName(c.targetProfileId)}</TableCell>
                      <TableCell>
                        {format(new Date(c.expiresAt), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell>
                        {c.botUrl ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              navigator.clipboard.writeText(c.botUrl!)
                              toast.success("Bot link copied")
                            }}
                          >
                            <Link className="h-3 w-3" />
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteCodeId(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteCodeId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCodeId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invite code?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the invite code. Anyone who has not yet used it
              will no longer be able to join.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteCodeId) handleDelete(deleteCodeId)
                setDeleteCodeId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
