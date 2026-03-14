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
      <div className="max-w-[180px] overflow-x-auto no-scrollbar sm:max-w-none [-webkit-overflow-scrolling:touch]">
        <TabsList className="inline-flex h-7 w-fit flex-nowrap">
          <TabsTrigger value="combined" className="text-xs shrink-0 px-2">
            Combined
          </TabsTrigger>
          {profiles.map((p) => (
            <TabsTrigger key={p.id} value={p.id} className="text-xs shrink-0 px-2">
              {p.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}
