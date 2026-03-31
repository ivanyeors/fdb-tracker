"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { useIsMobile } from "@/hooks/use-mobile"
import { useUserSettingsSave } from "@/components/layout/user-settings-save-context"
import { CombinedImpactConfirmationDialog } from "@/components/ui/combined-impact-confirmation-dialog"
import type { ImpactNodeId } from "@/lib/impact-graph"
import { cn } from "@/lib/utils"

const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  banks: "Banks",
  cpf: "CPF",
  cashflow: "Cashflow",
  investments: "Investments",
  ilp: "ILP",
  group: "Group",
  loans: "Loans",
  insurance: "Insurance",
  tax: "Tax Planner",
  developer: "Developer",
  goals: "Goals",
  settings: "Settings",
  users: "User Settings",
  giro: "GIRO Rules",
  notifications: "Notifications",
  setup: "Setup",
}

const rootOverrides: Record<string, string> = {
  "/dashboard": "Overview",
  "/settings": "General",
}

const UUID_RE = /^[0-9a-f-]{20,}$/i

type Crumb = { label: string; href: string }

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return []

  const crumbs: Crumb[] = []
  let path = ""

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    path += `/${seg}`

    // Skip UUID-like dynamic segments (e.g. groupId)
    if (UUID_RE.test(seg)) continue

    const isFirst = i === 0
    const isLast = i === segments.length - 1 || (i === segments.length - 2 && UUID_RE.test(segments[segments.length - 1]))

    // Root section pages get special labels
    if (isFirst && isLast && rootOverrides[path]) {
      crumbs.push({ label: rootOverrides[path], href: path })
      continue
    }

    const label = segmentLabels[seg] ?? seg
    crumbs.push({ label, href: path })
  }

  return crumbs
}

export function Header() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const profileIdFromUrl = searchParams.get("profileId")
  const { setActiveProfileId, profiles } = useActiveProfile()
  const { aggregateDirty, saveAll, isSaving, getDirtyImpactNodeIds } = useUserSettingsSave()
  const scrollDir = useScrollDirection()
  const isMobile = useIsMobile()
  const mobileCollapsed = isMobile && scrollDir === "down"
  const isUserSettings = pathname === "/settings/users"
  const [impactDialogOpen, setImpactDialogOpen] = useState(false)
  const [pendingImpactNodeIds, setPendingImpactNodeIds] = useState<ImpactNodeId[]>([])

  const handleSaveClick = useCallback(() => {
    const dirtyNodeIds = getDirtyImpactNodeIds()
    if (dirtyNodeIds.length > 0) {
      setPendingImpactNodeIds(dirtyNodeIds)
      setImpactDialogOpen(true)
    } else {
      void saveAll()
    }
  }, [getDirtyImpactNodeIds, saveAll])

  const handleImpactConfirm = useCallback(() => {
    setImpactDialogOpen(false)
    setPendingImpactNodeIds([])
    void saveAll()
  }, [saveAll])

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

  const crumbs = buildBreadcrumbs(pathname)

  return (
    <header
      className={cn(
        "shrink-0 border-b bg-background px-3 transition-[max-height] duration-200 sm:px-4",
        mobileCollapsed ? "max-h-0 overflow-hidden border-b-0" : "max-h-10",
        isUserSettings &&
          !mobileCollapsed &&
          "sticky top-0 z-30 supports-backdrop-filter:bg-background/95 supports-backdrop-filter:backdrop-blur-sm"
      )}
    >
      <div className="flex h-10 items-center gap-2">
        <nav className="flex min-w-0 items-center gap-1 text-sm">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <span key={crumb.href} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                )}
                {isLast ? (
                  <span className="truncate font-medium">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            )
          })}
        </nav>

        {isUserSettings && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!aggregateDirty || isSaving}
              onClick={handleSaveClick}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        )}
      </div>
      <CombinedImpactConfirmationDialog
        open={impactDialogOpen}
        onOpenChange={setImpactDialogOpen}
        sourceNodeIds={pendingImpactNodeIds}
        onConfirm={handleImpactConfirm}
      />
    </header>
  )
}
