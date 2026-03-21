"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActiveProfile } from "@/hooks/use-active-profile"

export function ProfileToggle() {
  const { activeProfileId, setActiveProfileId, profiles } = useActiveProfile()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleValueChange(v: string) {
    const id = v === "combined" ? null : v
    setActiveProfileId(id)
    if (pathname.startsWith("/dashboard")) {
      const next = new URLSearchParams(searchParams.toString())
      if (id) next.set("profileId", id)
      else next.delete("profileId")
      const q = next.toString()
      router.replace(q ? `${pathname}?${q}` : pathname)
    }
  }

  return (
    <Tabs
      value={activeProfileId ?? "combined"}
      onValueChange={handleValueChange}
    >
      <div className="min-w-0 max-w-[180px] overflow-x-auto no-scrollbar sm:max-w-none [-webkit-overflow-scrolling:touch] [overscroll-behavior-x:contain]">
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
