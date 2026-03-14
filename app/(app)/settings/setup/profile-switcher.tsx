"use client"

import { format } from "date-fns"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Profile = {
  id: string
  name: string
  birth_year: number
  created_at: string
  family_id?: string
}

export function ProfileSwitcher({ profiles }: { profiles: Profile[] }) {
  const { activeFamilyId, activeProfileId, setActiveProfileId } = useActiveProfile()

  const filteredProfiles = activeFamilyId
    ? profiles.filter((p) => (p.family_id ?? "") === activeFamilyId)
    : profiles

  if (!filteredProfiles.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profiles</CardTitle>
          <CardDescription>No profiles found for the active family.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const selectedId = activeProfileId ?? filteredProfiles[0]?.id ?? ""
  const selected = filteredProfiles.find((p) => p.id === selectedId) ?? filteredProfiles[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Switch Profile</CardTitle>
        <CardDescription>Select a profile to view its details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <div className="rounded-lg border p-4 space-y-2 bg-muted/50">
            <div className="text-sm">
              <span className="font-semibold">Name:</span> {selected.name}
            </div>
            <div className="text-sm">
              <span className="font-semibold">Birth Year:</span> {selected.birth_year}
            </div>
            <div className="text-sm">
              <span className="font-semibold">Created:</span>{" "}
              {format(new Date(selected.created_at), "MMM d, yyyy h:mm a")}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
