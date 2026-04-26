"use client"

import { useRouter } from "next/navigation"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { NAV_ENTRIES } from "@/lib/global-toolbar/nav-index"

export function GlobalToolbarSearch({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const router = useRouter()

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  const groups = NAV_ENTRIES.reduce<Record<string, typeof NAV_ENTRIES>>(
    (acc, entry) => {
      acc[entry.group] = acc[entry.group] ?? []
      acc[entry.group].push(entry)
      return acc
    },
    {}
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search pages and actions"
    >
      <Command>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(groups).map(([groupName, entries], idx) => (
            <div key={groupName}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={groupName}>
                {entries.map((entry) => (
                  <CommandItem
                    key={entry.href}
                    value={`${entry.group} ${entry.title}`}
                    onSelect={() => go(entry.href)}
                    className="gap-2"
                  >
                    <entry.icon className="h-4 w-4 shrink-0 opacity-70" />
                    <span>{entry.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
