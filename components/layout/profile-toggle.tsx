"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActiveProfile } from "@/hooks/use-active-profile"

export function ProfileToggle() {
  const { activeProfileId, setActiveProfileId, profiles } = useActiveProfile()

  return (
    <Tabs
      value={activeProfileId ?? "combined"}
      onValueChange={(v) => setActiveProfileId(v === "combined" ? null : v)}
    >
      <TabsList className="h-7">
        <TabsTrigger value="combined" className="text-xs px-2">
          Combined
        </TabsTrigger>
        {profiles.map((p) => (
          <TabsTrigger key={p.id} value={p.id} className="text-xs px-2">
            {p.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
