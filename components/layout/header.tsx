"use client"

import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ProfileToggle } from "@/components/layout/profile-toggle"

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/banks": "Banks",
  "/dashboard/cpf": "CPF",
  "/dashboard/cashflow": "Cashflow",
  "/dashboard/investments": "Investments",
  "/dashboard/investments/detail": "Investments Detail",
  "/dashboard/goals": "Savings Goals",
  "/dashboard/loans": "Loans",
  "/dashboard/insurance": "Insurance",
  "/dashboard/tax": "Tax",
  "/settings": "General Settings",
  "/settings/users": "User Settings",
  "/settings/notifications": "Notifications",
  "/settings/setup": "Setup",
}

export function Header() {
  const pathname = usePathname()
  const sectionName = breadcrumbMap[pathname] ?? "Dashboard"

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 !h-4" />
      <h2 className="text-sm font-medium">{sectionName}</h2>
      <div className="ml-auto">
        <ProfileToggle />
      </div>
    </header>
  )
}
