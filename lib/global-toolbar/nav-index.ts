import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Code,
  CreditCard,
  Landmark,
  Receipt,
  Settings,
  Shield,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react"

export type NavEntry = {
  title: string
  href: string
  icon: LucideIcon
  group: "Dashboard" | "Settings"
}

export const NAV_ENTRIES: NavEntry[] = [
  { title: "Overview", href: "/dashboard", icon: BarChart3, group: "Dashboard" },
  { title: "Banks", href: "/dashboard/banks", icon: Building2, group: "Dashboard" },
  { title: "CPF", href: "/dashboard/cpf", icon: Landmark, group: "Dashboard" },
  { title: "Cashflow", href: "/dashboard/cashflow", icon: ArrowLeftRight, group: "Dashboard" },
  { title: "Investments", href: "/dashboard/investments", icon: TrendingUp, group: "Dashboard" },
  { title: "Loans", href: "/dashboard/loans", icon: CreditCard, group: "Dashboard" },
  { title: "Insurance", href: "/dashboard/insurance", icon: Shield, group: "Dashboard" },
  { title: "Tax", href: "/dashboard/tax", icon: Receipt, group: "Dashboard" },
  { title: "Developer", href: "/dashboard/developer", icon: Code, group: "Dashboard" },
  { title: "General Settings", href: "/settings", icon: Settings, group: "Settings" },
  { title: "User Settings", href: "/settings/users", icon: Users, group: "Settings" },
  { title: "Platform Admins", href: "/settings/admins", icon: ShieldCheck, group: "Settings" },
]
