"use client"

import { format } from "date-fns"
import { Copy, Plus } from "lucide-react"
import { toast } from "sonner"
import { useActiveProfile } from "@/hooks/use-active-profile"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addNewFamilyAction } from "../actions"

type Profile = {
  id: string
  name: string
  birth_year: number
  created_at: string
  family_id?: string
}

type Family = {
  id: string
  name: string
  user_count: number
  created_at: string
}

type Household = {
  onboarding_completed_at: string | null
  user_count: number
}

export function AccountOverview({
  householdId,
  profiles,
  families,
  household,
}: {
  householdId: string
  profiles: Profile[]
  families: Family[]
  household: Household
}) {
  const handleCopyHouseholdId = async () => {
    try {
      await navigator.clipboard.writeText(householdId)
      toast.success("Household ID copied")
    } catch {
      toast.error("Failed to copy")
    }
  }

  const { activeFamilyId, activeProfileId, setActiveProfileId } =
    useActiveProfile()

  const filteredProfiles = activeFamilyId
    ? profiles.filter((p) => (p.family_id ?? "") === activeFamilyId)
    : profiles

  const selectedId = activeProfileId ?? filteredProfiles[0]?.id ?? ""
  const selected =
    filteredProfiles.find((p) => p.id === selectedId) ?? filteredProfiles[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Overview</CardTitle>
        <CardDescription>
          Your household setup summary and active profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Families
            </p>
            <p className="text-lg font-semibold">{families.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Profiles
            </p>
            <p className="text-lg font-semibold">{profiles.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Setup completed
            </p>
            {household.onboarding_completed_at ? (
              <p className="text-lg font-semibold">
                {format(
                  new Date(household.onboarding_completed_at),
                  "MMM d, yyyy"
                )}
              </p>
            ) : (
              <Badge variant="destructive" className="mt-1">
                Incomplete
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-3 bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Household ID
            </p>
            <p className="font-mono text-sm break-all">{householdId}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCopyHouseholdId}
            aria-label="Copy household ID"
            className="self-end sm:self-center"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Profile switcher */}
        {filteredProfiles.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="profile-select">Active Profile</Label>
              <Select value={selectedId} onValueChange={setActiveProfileId}>
                <SelectTrigger id="profile-select" className="w-full sm:w-64">
                  <SelectValue placeholder="Choose a profile" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected && (
              <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-border rounded-lg border p-3 bg-muted/50">
                <div className="py-1 sm:px-4 sm:first:pl-0">
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-sm font-medium">{selected.name}</p>
                </div>
                <div className="py-1 sm:px-4">
                  <p className="text-xs text-muted-foreground">Birth Year</p>
                  <p className="text-sm font-medium">{selected.birth_year}</p>
                </div>
                <div className="py-1 sm:px-4">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">
                    {format(new Date(selected.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No profiles found for the active family.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t bg-muted/50 px-6 py-4">
        <p className="text-xs text-muted-foreground">
          Opens onboarding wizard
        </p>
        <form action={addNewFamilyAction}>
          <Button type="submit" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add Family
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
