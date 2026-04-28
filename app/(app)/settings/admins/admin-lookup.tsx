"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Loader2, Search, ShieldCheck, ShieldOff } from "lucide-react"
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AdminHouseholdView {
  id: string
  accountType: string
  isSuperAdmin: boolean
  createdAt: string
  primaryProfileName: string | null
}

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; data: AdminHouseholdView }
  | { kind: "not-found" }
  | { kind: "error"; message: string }

interface AdminLookupProps {
  readonly currentAccountId: string
}

export function AdminLookup({ currentAccountId }: AdminLookupProps) {
  const [uuid, setUuid] = useState("")
  const [state, setState] = useState<LookupState>({ kind: "idle" })
  const [mutating, setMutating] = useState(false)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = uuid.trim()
    if (!UUID_RE.test(trimmed)) {
      toast.error("Enter a valid UUID.")
      return
    }
    setState({ kind: "loading" })
    try {
      const res = await fetch(`/api/admin/households/${trimmed}`)
      if (res.status === 404) {
        setState({ kind: "not-found" })
        return
      }
      if (!res.ok) {
        setState({ kind: "error", message: `Lookup failed (${res.status}).` })
        return
      }
      const data: AdminHouseholdView = await res.json()
      setState({ kind: "found", data })
    } catch {
      setState({ kind: "error", message: "Network error." })
    }
  }

  async function handleToggle(target: AdminHouseholdView) {
    setMutating(true)
    try {
      const res = await fetch(`/api/admin/households/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuperAdmin: !target.isSuperAdmin }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(payload?.error ?? `Update failed (${res.status}).`)
        return
      }
      setState({ kind: "found", data: payload as AdminHouseholdView })
      toast.success(
        target.isSuperAdmin
          ? "Super-admin role removed."
          : "Super-admin role granted."
      )
    } catch {
      toast.error("Network error.")
    } finally {
      setMutating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Look up household</CardTitle>
        <CardDescription>
          Search by household UUID. The roster is intentionally not listed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleLookup} className="space-y-2">
          <Label htmlFor="admin-lookup-uuid">Household UUID</Label>
          <div className="flex gap-2">
            <Input
              id="admin-lookup-uuid"
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" disabled={state.kind === "loading"}>
              {state.kind === "loading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              <span className="ml-2">Look up</span>
            </Button>
          </div>
        </form>

        {state.kind === "idle" && (
          <p className="text-muted-foreground text-sm">
            Enter a household UUID to inspect or promote.
          </p>
        )}

        {state.kind === "not-found" && (
          <p className="text-muted-foreground text-sm">
            No account found for that UUID.
          </p>
        )}

        {state.kind === "error" && (
          <p className="text-destructive text-sm">{state.message}</p>
        )}

        {state.kind === "found" && (
          <ResultCard
            data={state.data}
            currentAccountId={currentAccountId}
            mutating={mutating}
            onToggle={handleToggle}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface ResultCardProps {
  readonly data: AdminHouseholdView
  readonly currentAccountId: string
  readonly mutating: boolean
  readonly onToggle: (data: AdminHouseholdView) => void
}

function ResultCard({
  data,
  currentAccountId,
  mutating,
  onToggle,
}: ResultCardProps) {
  const isSelf = data.id === currentAccountId
  const promoting = !data.isSuperAdmin
  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="font-medium">
            {data.primaryProfileName ?? "(no profile name)"}
          </div>
          <div className="text-muted-foreground text-xs font-mono">
            {data.id}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={data.isSuperAdmin ? "default" : "outline"}>
            {data.isSuperAdmin ? "super-admin" : "regular"}
          </Badge>
          <Badge variant="secondary">{data.accountType}</Badge>
        </div>
      </div>
      <div className="text-muted-foreground text-xs">
        Created {format(new Date(data.createdAt), "PP")}
      </div>
      <Button
        type="button"
        variant={promoting ? "default" : "destructive"}
        disabled={mutating || (isSelf && data.isSuperAdmin)}
        onClick={() => onToggle(data)}
      >
        {(() => {
          if (mutating) return <Loader2 className="size-4 animate-spin" />
          if (promoting) return <ShieldCheck className="size-4" />
          return <ShieldOff className="size-4" />
        })()}
        <span className="ml-2">
          {promoting ? "Promote to super-admin" : "Demote to regular"}
        </span>
      </Button>
      {isSelf && data.isSuperAdmin && (
        <p className="text-muted-foreground text-xs">
          You cannot remove your own super-admin role.
        </p>
      )}
    </div>
  )
}
