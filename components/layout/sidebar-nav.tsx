"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Building2,
  Landmark,
  ArrowLeftRight,
  TrendingUp,
  Target,
  CreditCard,
  Shield,
  Receipt,
  LayoutDashboard,
  Settings,
  Sliders,
  Users,
  Bell,
  Wrench,
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
} from "@/components/ui/sidebar"

import { createSupabaseClient } from "@/lib/supabase/client"
import { CompleteSetupNav } from "@/components/layout/complete-setup-nav"

const dashboardItems = [
  { title: "Overview", href: "/dashboard", icon: BarChart3 },
  { title: "Banks", href: "/dashboard/banks", icon: Building2 },
  { title: "CPF", href: "/dashboard/cpf", icon: Landmark },
  { title: "Cashflow", href: "/dashboard/cashflow", icon: ArrowLeftRight },
  { title: "Investments", href: "/dashboard/investments", icon: TrendingUp },
  { title: "Savings Goals", href: "/dashboard/goals", icon: Target },
  { title: "Loans", href: "/dashboard/loans", icon: CreditCard },
  { title: "Insurance", href: "/dashboard/insurance", icon: Shield },
  { title: "Tax", href: "/dashboard/tax", icon: Receipt },
]

const settingsItems = [
  { title: "General", href: "/settings", icon: Sliders },
  { title: "User Settings", href: "/settings/users", icon: Users },
  { title: "GIRO Rules", href: "/settings/giro", icon: Repeat },
  { title: "Notifications", href: "/settings/notifications", icon: Bell },
  { title: "Setup", href: "/settings/setup", icon: Wrench },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="text-lg font-semibold tracking-tight">fdb-tracker</span>
      </SidebarHeader>
      <SidebarContent>
        <CompleteSetupNav />
        <SidebarGroup>
          <SidebarGroupLabel>
            <LayoutDashboard className="mr-1.5" />
            Dashboard
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    className="ml-4"
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
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
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    className="ml-4"
                  >
                    <Link href={item.href}>
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
