"use client"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { FamilySwitcherPopover } from "@/components/layout/family-switcher-popover"
import { ProfileToggle } from "@/components/layout/profile-toggle"
import { useGlobalMonth, getCurrentMonth } from "@/hooks/use-global-month"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { useEffect } from "react"

export function TopNav() {
  const { setSelectedMonth, availableMonths, effectiveMonth } = useGlobalMonth()
  const scrollDir = useScrollDirection()
  const isMobile = useIsMobile()
  const mobileCollapsed = isMobile && scrollDir === "down"

  useEffect(() => {
    if (mobileCollapsed) {
      document.documentElement.dataset.mobileNavCollapsed = "true"
    } else {
      delete document.documentElement.dataset.mobileNavCollapsed
    }
  }, [mobileCollapsed])

  return (
    <>
      {/* Main nav bar — collapses on mobile scroll-down, translates on desktop */}
      <nav
        className={cn(
          "fixed inset-x-0 top-0 z-40 border-b bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/80",
          isMobile
            ? "overflow-hidden transition-[max-height] duration-200"
            : "transition-transform duration-200",
          scrollDir === "down" && isMobile && "max-h-0 border-b-0",
          scrollDir !== "down" && isMobile && "max-h-12"
        )}
      >
        <div className="flex h-12 items-center gap-2 px-3">
          {/* Left section — trigger + family + month */}
          <div className="flex min-w-0 items-center gap-1.5">
            <SidebarTrigger className="-ml-1 shrink-0" />
            <Separator orientation="vertical" className="!h-5 shrink-0" />
            <FamilySwitcherPopover />
            <Separator orientation="vertical" className="!h-5 shrink-0" />
            {effectiveMonth ? (
              <MonthYearPicker
                value={effectiveMonth}
                onChange={setSelectedMonth}
                maxMonth={getCurrentMonth()}
                highlightedMonths={
                  availableMonths.length > 0 ? availableMonths : undefined
                }
                placeholder="Month"
                className="h-8 w-[110px] text-xs"
              />
            ) : (
              <div className="h-8 w-[110px]" />
            )}
          </div>

          {/* Right section — profile toggle (desktop) */}
          {!isMobile && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ProfileToggle />
            </div>
          )}
        </div>
      </nav>

      {/* Mobile profile toggle — separate fixed bar, always visible */}
      {isMobile && (
        <div
          className={cn(
            "fixed inset-x-0 z-40 border-b bg-background/95 px-3 pb-2 pt-1.5 transition-[top] duration-200 supports-backdrop-filter:bg-background/80",
            mobileCollapsed ? "top-0" : "top-12"
          )}
        >
          <ProfileToggle />
        </div>
      )}
    </>
  )
}
