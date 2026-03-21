"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ProfileToggle } from "@/components/layout/profile-toggle"
import { FamilySwitcher } from "@/components/layout/family-switcher"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useUserSettingsSave } from "@/components/layout/user-settings-save-context"
import { cn } from "@/lib/utils"

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/banks": "Banks",
  "/dashboard/cpf": "CPF",
  "/dashboard/cashflow": "Cashflow",
  "/dashboard/investments": "Investments",
  "/dashboard/goals": "Savings Goals",
  "/dashboard/loans": "Loans",
  "/dashboard/insurance": "Insurance",
  "/dashboard/tax": "Tax Planner",
  "/settings": "General Settings",
  "/settings/users": "User Settings",
  "/settings/giro": "GIRO Rules",
  "/settings/notifications": "Notifications",
  "/settings/setup": "Setup",
}

export function Header() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setActiveProfileId, profiles } = useActiveProfile()
  const { aggregateDirty, saveAll, isSaving } = useUserSettingsSave()
  const isUserSettings = pathname === "/settings/users"

  useEffect(() => {
    if (pathname.startsWith("/dashboard") && searchParams.has("profileId")) {
      const profileId = searchParams.get("profileId")
      if (profileId && profiles.some((p) => p.id === profileId)) {
        setActiveProfileId(profileId)
      }
    }
  }, [pathname, searchParams, setActiveProfileId, profiles])

  const sectionName = breadcrumbMap[pathname] ?? "Dashboard"

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4",
        isUserSettings &&
          "sticky top-0 z-30 supports-backdrop-filter:bg-background/95 supports-backdrop-filter:backdrop-blur-sm"
      )}
    >
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Separator orientation="vertical" className="mr-2 !h-4 shrink-0" />
      <h2 className="min-w-0 truncate text-sm font-medium">{sectionName}</h2>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {isUserSettings && (
          <Button
            type="button"
            size="sm"
            disabled={!aggregateDirty || isSaving}
            onClick={() => void saveAll()}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        )}
        <FamilySwitcher />
        <ProfileToggle />
      </div>
    </header>
  )
}
