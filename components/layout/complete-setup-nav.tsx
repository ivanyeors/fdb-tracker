"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Rocket, ChevronDown } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type OptionalStatus = {
  profiles: Array<{ id: string; name: string; optionalComplete: boolean }>
  showCompleteSetup: boolean
}

export function CompleteSetupNav() {
  const router = useRouter()
  const [status, setStatus] = useState<OptionalStatus | null>(null)

  useEffect(() => {
    fetch("/api/onboarding/optional-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStatus(data ?? null))
      .catch(() => setStatus(null))
  }, [])

  if (!status?.showCompleteSetup || status.profiles.length === 0) {
    return null
  }

  const handleSelectProfile = (profileId: string) => {
    router.push(`/onboarding/optional?profileId=${profileId}`)
  }

  const content =
    status.profiles.length === 1 ? (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="Complete setup">
          <Link href={`/onboarding/optional?profileId=${status.profiles[0]!.id}`}>
            <Rocket />
            <span>Complete setup</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ) : (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip="Complete setup for a user">
              <Rocket />
              <span>Complete setup for</span>
              <ChevronDown className="ml-auto size-4 opacity-50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-56">
            {status.profiles.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => handleSelectProfile(p.id)}
              >
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        <Rocket className="mr-1.5" />
        Setup
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>{content}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
