"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Building2,
  Landmark,
  ArrowLeftRight,
  TrendingUp,
  CreditCard,
  Shield,
  Receipt,
  Code,
  LayoutDashboard,
  Settings,
  Sliders,
  Users,
  LogOut,
  Repeat,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar"

import { createSupabaseClient } from "@/lib/supabase/client"
import { CompleteSetupNav } from "@/components/layout/complete-setup-nav"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/ui/app-icon"

const dashboardItems = [
  { title: "Overview", href: "/dashboard", icon: BarChart3 },
  { title: "Banks", href: "/dashboard/banks", icon: Building2 },
  { title: "CPF", href: "/dashboard/cpf", icon: Landmark },
  { title: "Cashflow", href: "/dashboard/cashflow", icon: ArrowLeftRight },
  { title: "Investments", href: "/dashboard/investments", icon: TrendingUp, badge: "BETA" },
  { title: "Loans", href: "/dashboard/loans", icon: CreditCard, badge: "BETA" },
  { title: "Insurance", href: "/dashboard/insurance", icon: Shield, badge: "BETA" },
  { title: "Tax", href: "/dashboard/tax", icon: Receipt, badge: "BETA" },
  { title: "Developer", href: "/dashboard/developer", icon: Code },
]

const settingsItems = [
  { title: "General", href: "/settings", icon: Sliders },
  { title: "User Settings", href: "/settings/users", icon: Users },
  { title: "GIRO Rules", href: "/settings/giro", icon: Repeat },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useIsMobile()
  const { setOpenMobile } = useSidebar()
  const supabase = createSupabaseClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const handleMobileNav = () => {
    if (isMobile) setOpenMobile(false)
  }

  const mobileButtonClass = isMobile
    ? "h-12 gap-3 rounded-xl bg-sidebar-accent/50 px-4 text-base [&_svg]:size-5"
    : "ml-4"

  const mobileLogoutClass = isMobile
    ? "h-12 gap-3 rounded-xl bg-sidebar-accent/50 px-4 text-base [&_svg]:size-5"
    : ""

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-2">
        <AppIcon className="size-6" />
      </SidebarHeader>
      <SidebarContent>
        <CompleteSetupNav />
        <SidebarGroup>
          <SidebarGroupLabel>
            <LayoutDashboard className="mr-1.5" />
            Dashboard
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className={cn(isMobile && "gap-1.5 px-2")}>
              {dashboardItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    className={mobileButtonClass}
                  >
                    <Link href={item.href} onClick={handleMobileNav}>
                      <item.icon />
                      <span>{item.title}</span>
                      {"badge" in item && item.badge && (
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            <Settings className="mr-1.5" />
            Settings
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className={cn(isMobile && "gap-1.5 px-2")}>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    className={mobileButtonClass}
                  >
                    <Link href={item.href} onClick={handleMobileNav}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className={cn(isMobile && "px-2 pb-4")}>
        <SidebarMenu className={cn(isMobile && "gap-1.5")}>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Logout"
              className={mobileLogoutClass}
            >
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
