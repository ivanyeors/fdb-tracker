"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActiveProfile } from "@/hooks/use-active-profile"

export function FamilySwitcher() {
  const { families, activeFamilyId, setActiveFamilyId } = useActiveProfile()
  const router = useRouter()

  if (families.length <= 1) return null

  function handleChange(value: string) {
    setActiveFamilyId(value)
    try {
      document.cookie = `fdb-active-family-id=${value}; path=/; max-age=31536000; SameSite=Lax`
    } catch {
      // ignore
    }
    router.refresh()
  }

  return (
    <Select value={activeFamilyId ?? ""} onValueChange={handleChange}>
      <SelectTrigger className="h-7 w-[120px] text-xs">
        <SelectValue placeholder="Family" />
      </SelectTrigger>
      <SelectContent>
        {families.map((f) => (
          <SelectItem key={f.id} value={f.id} className="text-xs">
            {f.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
