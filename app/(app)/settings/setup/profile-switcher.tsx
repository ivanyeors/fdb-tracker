"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Profile = {
  id: string
  name: string
  birth_year: number
  created_at: string
}

export function ProfileSwitcher({ profiles }: { profiles: Profile[] }) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "")

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0]

  if (!profiles.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profiles</CardTitle>
          <CardDescription>No profiles found for this household.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Switch Profile</CardTitle>
        <CardDescription>Select a profile to view its details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-select">Active Profile</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger id="profile-select" className="w-full sm:w-64">
              <SelectValue placeholder="Choose a profile" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
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
