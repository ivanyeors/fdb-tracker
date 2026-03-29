"use client"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { FamilySwitcherPopover } from "@/components/layout/family-switcher-popover"
import { ProfileToggle } from "@/components/layout/profile-toggle"
import { useGlobalMonth } from "@/hooks/use-global-month"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

export function TopNav() {
  const { setSelectedMonth, availableMonths, effectiveMonth } = useGlobalMonth()
  const scrollDir = useScrollDirection()
  const isMobile = useIsMobile()

  return (
    <nav
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b bg-background/95 backdrop-blur-sm transition-transform duration-200 supports-backdrop-filter:bg-background/80",
        scrollDir === "down" && "-translate-y-full"
      )}
    >
      {/* Main row */}
      <div className="flex h-12 items-center gap-2 px-3">
        {/* Left section — trigger + family + month */}
        <div className="flex min-w-0 items-center gap-1.5">
          <SidebarTrigger className="-ml-1 shrink-0" />
          <Separator orientation="vertical" className="!h-5 shrink-0" />
          <FamilySwitcherPopover />
          <Separator orientation="vertical" className="!h-5 shrink-0" />
          <MonthYearPicker
            value={effectiveMonth}
            onChange={setSelectedMonth}
            availableMonths={
              availableMonths.length > 0 ? availableMonths : undefined
            }
            placeholder="Month"
            className="h-8 w-[110px] text-xs"
          />
        </div>

        {/* Right section — profile toggle */}
        {!isMobile && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ProfileToggle />
          </div>
        )}
      </div>

      {/* Mobile second row — profile toggle */}
      {isMobile && (
        <div className="border-t px-3 pb-2 pt-1.5">
          <ProfileToggle />
        </div>
      )}
    </nav>
  )
}
