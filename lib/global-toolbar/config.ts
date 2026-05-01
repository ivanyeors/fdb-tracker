import type { LucideIcon } from "lucide-react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CalendarClock,
  HandCoins,
  PiggyBank,
  Plus,
  Receipt,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react"

export type ToolbarAction = {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  href: string
  /**
   * When set, the toolbar links to `?action=<value>` on the current pathname
   * (preserving other params) instead of navigating to `href`. The page reads
   * the param, opens its own dialog, and clears it.
   */
  action?: string
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
    ctas: [],
  },
  "/dashboard/cashflow": {
    ctas: [
      {
        id: "upload-statement",
        label: "Upload statement",
        description: "Import transactions from a bank statement",
        icon: ArrowUpCircle,
        href: "/dashboard/cashflow?tab=categories",
      },
    ],
  },
  "/dashboard/investments": {
    ctas: [
      {
        id: "add-holding",
        label: "Add holding",
        description: "Record a stock or ETF position",
        icon: TrendingUp,
        href: "/dashboard/investments",
        action: "add-holding",
      },
      {
        id: "edit-cash",
        label: "Edit cash balance",
        description: "Update cash held in your investment account",
        icon: Wallet,
        href: "/dashboard/investments",
        action: "edit-cash",
      },
      {
        id: "ilp-update",
        label: "Update ILP value",
        description: "Set a monthly ILP fund value",
        icon: PiggyBank,
        href: "/dashboard/investments?tab=ilp",
        action: "ilp-update",
      },
    ],
  },
  "/dashboard/banks": {
    ctas: [
      {
        id: "manage-bank-accounts",
        label: "Manage bank accounts",
        description: "Add or edit accounts in user settings",
        icon: Banknote,
        href: "/settings/users",
      },
    ],
  },
  "/dashboard/cpf": {
    ctas: [
      {
        id: "edit-cpf-balances",
        label: "Edit CPF balances",
        description: "Update OA / SA / MA / RA in user settings",
        icon: Wallet,
        href: "/settings/users",
      },
    ],
  },
  "/dashboard/goals": {
    ctas: [
      {
        id: "manage-goals",
        label: "Manage savings goals",
        description: "Add or edit goals in user settings",
        icon: Target,
        href: "/settings/users",
      },
    ],
  },
  "/dashboard/loans": {
    ctas: [
      {
        id: "log-repayment",
        label: "Log repayment",
        description: "Record a loan payment",
        icon: HandCoins,
        href: "/dashboard/loans",
        action: "log-repayment",
      },
      {
        id: "add-loan",
        label: "Add loan",
        description: "Track a new loan",
        icon: Plus,
        href: "/dashboard/loans",
        action: "add-loan",
      },
    ],
  },
  "/dashboard/insurance": {
    ctas: [
      {
        id: "add-policy",
        label: "Add policy",
        description: "Track a new insurance policy",
        icon: ShieldCheck,
        href: "/dashboard/insurance",
        action: "add-policy",
      },
    ],
  },
  "/dashboard/tax": {
    ctas: [
      {
        id: "add-actual-tax",
        label: "Record actual tax (NOA)",
        description: "Enter the tax payable from your IRAS Notice of Assessment",
        icon: Receipt,
        href: "/dashboard/tax",
        action: "add-actual-tax",
      },
      {
        id: "add-monthly-tax",
        label: "Set monthly installment",
        description: "Record a GIRO monthly tax installment",
        icon: CalendarClock,
        href: "/dashboard/tax",
        action: "add-monthly-tax",
      },
    ],
  },
  "/dashboard/developer": {
    ctas: [],
  },
  "/settings": {
    ctas: [],
  },
  "/settings/admins": {
    ctas: [],
  },
  "/settings/notifications": {
    ctas: [],
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
