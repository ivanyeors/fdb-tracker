"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Building2,
  Landmark,
  ArrowLeftRight,
  Menu,
} from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

const navItems = [
  { title: "Overview", href: "/dashboard", icon: BarChart3 },
  { title: "Banks", href: "/dashboard/banks", icon: Building2 },
  { title: "CPF", href: "/dashboard/cpf", icon: Landmark },
  { title: "Cashflow", href: "/dashboard/cashflow", icon: ArrowLeftRight },
]

export function BottomNav() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  if (!isMobile) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)] px-4">
      <div className="flex h-14 w-full max-w-sm items-center justify-around rounded-2xl border bg-background/90 shadow-lg backdrop-blur-md supports-backdrop-filter:bg-background/75">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground transition-colors",
                isActive && "text-primary"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] leading-tight font-medium">
                {item.title}
              </span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] leading-tight font-medium">More</span>
        </button>
      </div>
    </nav>
  )
}
