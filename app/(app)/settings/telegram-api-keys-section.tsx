"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Copy, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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

type ApiKey = {
  id: string
  prefix: string
  name: string | null
  maxMembers: number
  linkedCount: number
  createdAt: string
}

type LinkedAccount = {
  id: string
  telegramUserId: string
  telegramUsername: string | null
  linkedAt: string
  apiKeyId: string
}

export function TelegramApiKeysSection() {
  const router = useRouter()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyMaxMembers, setNewKeyMaxMembers] = useState(10)
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null)
  const [createdKeyId, setCreatedKeyId] = useState<string | null>(null)
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null)
  const [removeLinkedId, setRemoveLinkedId] = useState<string | null>(null)

  async function fetchKeys() {
    try {
      const res = await fetch("/api/link-api-keys")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setKeys(data)
    } catch {
      toast.error("Failed to load API keys")
    } finally {
      setLoading(false)
    }
  }

  async function fetchLinkedAccounts() {
    try {
      const res = await fetch("/api/linked-telegram-accounts")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setLinkedAccounts(data)
    } catch {
      toast.error("Failed to load linked accounts")
    }
  }

  useEffect(() => {
    fetchKeys()
    fetchLinkedAccounts()
  }, [])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch("/api/link-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim() || undefined,
          maxMembers: newKeyMaxMembers,
        }),
      })
      if (!res.ok) throw new Error("Failed to create")
      const data = await res.json()
      setCreatedRawKey(data.rawKey)
      setCreatedKeyId(data.id)
      setNewKeyName("")
      toast.success("API key created")
      fetchKeys()
    } catch {
      toast.error("Failed to create API key")
    } finally {
      setCreating(false)
    }
  }

  async function handleCopyKey() {
    if (!createdRawKey) return
    await navigator.clipboard.writeText(createdRawKey)
    toast.success("API key copied to clipboard")
  }

  function handleDismissNewKey() {
    setCreatedRawKey(null)
    setCreatedKeyId(null)
  }

  async function handleDeleteKey(id: string) {
    try {
      const res = await fetch(`/api/link-api-keys/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("API key deleted")
      if (createdKeyId === id) handleDismissNewKey()
      fetchKeys()
      fetchLinkedAccounts()
      router.refresh()
    } catch {
      toast.error("Failed to delete API key")
    }
  }

  async function handleRemoveLinked(id: string) {
    try {
      const res = await fetch(`/api/linked-telegram-accounts/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to remove")
      toast.success("Linked account removed")
      fetchKeys()
      fetchLinkedAccounts()
      router.refresh()
    } catch {
      toast.error("Failed to remove linked account")
    }
  }

  function displayUsername(acc: LinkedAccount): string {
    return acc.telegramUsername
      ? `@${acc.telegramUsername}`
      : `user_${acc.telegramUserId}`
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Telegram API Keys</CardTitle>
          <CardDescription>
            Create API keys to link Telegram accounts to your household. Share
            the key with users who can then use /auth or /link in the Telegram
            bot — the bot will guide them through the process.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create form */}
          <div className="rounded-lg border p-4 bg-muted/50 space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2 min-w-[180px]">
                <Label htmlFor="key-name">Name (optional)</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. Family group"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              <div className="space-y-2 w-24">
                <Label htmlFor="key-max">Max members</Label>
                <Input
                  id="key-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={newKeyMaxMembers}
                  onChange={(e) =>
                    setNewKeyMaxMembers(
                      Math.max(1, Number.parseInt(e.target.value) || 1)
                    )
                  }
                />
              </div>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create
              </Button>
            </div>

            {createdRawKey && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 space-y-2">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                  Copy now. This key will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs break-all bg-muted px-2 py-1 rounded">
                    {createdRawKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyKey}
                    className="shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button size="sm" variant="ghost" onClick={handleDismissNewKey}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* API Keys table */}
          {(() => {
            if (loading) {
              return (
            <div className="space-y-2">
              {["a", "b", "c"].map((slot) => (
                <Skeleton key={`apikey-skeleton-${slot}`} className="h-10 w-full" />
              ))}
            </div>
              )
            }
            if (keys.length === 0) {
              return (
            <p className="text-sm text-muted-foreground">
              No API keys yet. Create one above.
            </p>
              )
            }
            return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">Your API keys</h4>
                <Badge variant="secondary">{keys.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell>{k.name ?? "—"}</TableCell>
                      <TableCell>
                        <code className="text-xs">{k.prefix}...</code>
                      </TableCell>
                      <TableCell>
                        {k.linkedCount} / {k.maxMembers}
                      </TableCell>
                      <TableCell>
                        {format(new Date(k.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteKeyId(k.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )
          })()}

          <Separator />

          {/* Linked accounts table */}
          {(() => {
            if (loading) {
              return (
            <div className="space-y-2">
              {["a", "b"].map((slot) => (
                <Skeleton key={`linked-skeleton-${slot}`} className="h-10 w-full" />
              ))}
            </div>
              )
            }
            if (linkedAccounts.length === 0) {
              return (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Linked Telegram accounts</h4>
              <p className="text-sm text-muted-foreground">
                No Telegram accounts linked yet. Share an API key with users to
                get started.
              </p>
            </div>
              )
            }
            return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">
                  Linked Telegram accounts
                </h4>
                <Badge variant="secondary">{linkedAccounts.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Linked at</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linkedAccounts.map((acc) => (
                    <TableRow key={acc.id}>
                      <TableCell>{displayUsername(acc)}</TableCell>
                      <TableCell>
                        {format(new Date(acc.linkedAt), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setRemoveLinkedId(acc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* Delete API key confirmation */}
      <AlertDialog
        open={deleteKeyId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteKeyId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the key and unlink all accounts connected through
              it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteKeyId) handleDeleteKey(deleteKeyId)
                setDeleteKeyId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove linked account confirmation */}
      <AlertDialog
        open={removeLinkedId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveLinkedId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove linked account?</AlertDialogTitle>
            <AlertDialogDescription>
              This Telegram user will lose access to your household data. They
              can re-link using a valid API key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removeLinkedId) handleRemoveLinked(removeLinkedId)
                setRemoveLinkedId(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
