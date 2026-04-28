import type { LucideIcon } from "lucide-react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  HandCoins,
  LineChart,
  PiggyBank,
  Plus,
  Receipt,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

export type ToolbarAction = {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  href: string
}

export type ToolbarConfig = {
  ctas: ToolbarAction[]
  /** When set, the toolbar renders a Save control sourced from this context. */
  saveContext?: "user-settings"
}

const DEFAULT_CTAS: ToolbarAction[] = [
  {
    id: "add-income",
    label: "Add income",
    description: "Log a monthly inflow",
    icon: ArrowDownCircle,
    href: "/dashboard/cashflow",
  },
  {
    id: "add-expense",
    label: "Add expense",
    description: "Log a monthly outflow",
    icon: ArrowUpCircle,
    href: "/dashboard/cashflow",
  },
]

/**
 * Map a route prefix to its toolbar configuration. Longest matching prefix wins
 * (see `getToolbarConfig`). Order does not matter — sorting happens at lookup.
 */
const ROUTE_CONFIG: Record<string, ToolbarConfig> = {
  "/dashboard": {
    ctas: [
      {
        id: "add-income",
        label: "Add income",
        icon: ArrowDownCircle,
        href: "/dashboard/cashflow",
      },
      {
        id: "add-expense",
        label: "Add expense",
        icon: ArrowUpCircle,
        href: "/dashboard/cashflow",
      },
      {
        id: "add-investment",
        label: "Buy / sell",
        icon: LineChart,
        href: "/dashboard/investments",
      },
    ],
  },
  "/dashboard/cashflow": {
    ctas: [
      {
        id: "add-income",
        label: "Add income",
        description: "Log a monthly inflow",
        icon: TrendingUp,
        href: "/dashboard/cashflow",
      },
      {
        id: "add-expense",
        label: "Add expense",
        description: "Log a monthly outflow",
        icon: TrendingDown,
        href: "/dashboard/cashflow",
      },
    ],
  },
  "/dashboard/investments": {
    ctas: [
      {
        id: "add-buy",
        label: "Buy",
        description: "Record a purchase",
        icon: TrendingUp,
        href: "/dashboard/investments",
      },
      {
        id: "add-sell",
        label: "Sell",
        description: "Record a disposal",
        icon: TrendingDown,
        href: "/dashboard/investments",
      },
      {
        id: "ilp-update",
        label: "Update ILP value",
        description: "Set a monthly ILP fund value",
        icon: PiggyBank,
        href: "/dashboard/investments?tab=ilp",
      },
    ],
  },
  "/dashboard/banks": {
    ctas: [
      {
        id: "add-bank-account",
        label: "Add bank account",
        icon: Banknote,
        href: "/dashboard/banks",
      },
    ],
  },
  "/dashboard/cpf": {
    ctas: [
      {
        id: "edit-cpf",
        label: "Edit CPF",
        icon: Wallet,
        href: "/dashboard/cpf",
      },
    ],
  },
  "/dashboard/goals": {
    ctas: [
      {
        id: "add-goal-contribution",
        label: "Contribute to goal",
        description: "Log a savings contribution",
        icon: Target,
        href: "/dashboard/goals",
      },
    ],
  },
  "/dashboard/loans": {
    ctas: [
      {
        id: "log-repayment",
        label: "Log repayment",
        icon: HandCoins,
        href: "/dashboard/loans",
      },
    ],
  },
  "/dashboard/insurance": {
    ctas: [
      {
        id: "add-policy",
        label: "Add policy",
        icon: ShieldCheck,
        href: "/dashboard/insurance",
      },
    ],
  },
  "/dashboard/tax": {
    ctas: [
      {
        id: "add-tax-noa",
        label: "Add NOA",
        icon: Receipt,
        href: "/dashboard/tax",
      },
    ],
  },
  "/settings/users": {
    ctas: [],
    saveContext: "user-settings",
  },
}

const DEFAULT_CONFIG: ToolbarConfig = { ctas: DEFAULT_CTAS }

export function getToolbarConfig(pathname: string): ToolbarConfig {
  const matches = Object.keys(ROUTE_CONFIG)
    .filter((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))
    .sort((a, b) => b.length - a.length)
  if (matches.length === 0) return DEFAULT_CONFIG
  return ROUTE_CONFIG[matches[0]]
}

export { Plus as TOOLBAR_DEFAULT_PLUS_ICON } from "lucide-react"
