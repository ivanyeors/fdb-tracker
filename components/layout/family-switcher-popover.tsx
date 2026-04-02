"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { cn } from "@/lib/utils"

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function FamilySwitcherPopover() {
  const { families, activeFamilyId, setActiveFamilyId } = useActiveProfile()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (families.length === 0) return null

  const activeFamily = families.find((f) => f.id === activeFamilyId)

  function handleSelect(familyId: string) {
    if (familyId === activeFamilyId) {
      setOpen(false)
      return
    }
    setActiveFamilyId(familyId)
    queueMicrotask(() => {
      try {
        document.cookie = `fdb-active-family-id=${familyId}; path=/; max-age=31536000; SameSite=Lax`
      } catch {
        // ignore
      }
    })
    setOpen(false)
    router.refresh()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="h-8 gap-2 px-2 text-sm font-medium"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
            {activeFamily ? getInitials(activeFamily.name) : "?"}
          </span>
          <span className="max-w-[120px] truncate">{activeFamily?.name ?? "Select family"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search families..." />
          <CommandList>
            <CommandEmpty>No families found.</CommandEmpty>
            <CommandGroup>
              {families.map((f) => (
                <CommandItem
                  key={f.id}
                  value={f.name}
                  onSelect={() => handleSelect(f.id)}
                  className="gap-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                    {getInitials(f.name)}
                  </span>
                  <span className="truncate">{f.name}</span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0",
                      f.id === activeFamilyId ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
