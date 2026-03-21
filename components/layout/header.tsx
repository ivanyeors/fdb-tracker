"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ProfileToggle } from "@/components/layout/profile-toggle"
import { FamilySwitcher } from "@/components/layout/family-switcher"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useUserSettingsSave } from "@/components/layout/user-settings-save-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/banks": "Banks",
  "/dashboard/cpf": "CPF",
  "/dashboard/cashflow": "Cashflow",
  "/dashboard/investments": "Investments",
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
  const profileIdFromUrl = searchParams.get("profileId")
  const { setActiveProfileId, profiles } = useActiveProfile()
  const { aggregateDirty, saveAll, isSaving } = useUserSettingsSave()
  const isUserSettings = pathname === "/settings/users"

  /** Only sync URL → state when the query `profileId` actually changes (navigation / replace).
   *  Otherwise we overwrite the user's tab selection while `router.replace` still has the old URL. */
  const lastSyncedDashboardProfileUrl = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!pathname.startsWith("/dashboard")) {
      lastSyncedDashboardProfileUrl.current = undefined
      return
    }
    const urlId = profileIdFromUrl
    const prev = lastSyncedDashboardProfileUrl.current
    if (prev === undefined) {
      lastSyncedDashboardProfileUrl.current = urlId
      if (urlId && profiles.some((p) => p.id === urlId)) {
        setActiveProfileId(urlId)
      }
      return
    }
    if (urlId === prev) return
    lastSyncedDashboardProfileUrl.current = urlId
    if (urlId && profiles.some((p) => p.id === urlId)) {
      setActiveProfileId(urlId)
    }
  }, [pathname, profileIdFromUrl, setActiveProfileId, profiles])

  const sectionName = breadcrumbMap[pathname] ?? "Dashboard"
  const isMobile = useIsMobile()

  return (
    <header
      className={cn(
        "shrink-0 border-b bg-background px-3 sm:px-4",
        isUserSettings &&
          "sticky top-0 z-30 supports-backdrop-filter:bg-background/95 supports-backdrop-filter:backdrop-blur-sm"
      )}
    >
      <div className="flex h-14 items-center gap-2">
        <SidebarTrigger className="-ml-1 hidden shrink-0 md:inline-flex" />
        <Separator orientation="vertical" className="mr-2 hidden !h-4 shrink-0 md:block" />
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
          {!isMobile && <ProfileToggle />}
        </div>
      </div>
      {isMobile && (
        <div className="pb-2">
          <ProfileToggle />
        </div>
      )}
    </header>
  )
}
