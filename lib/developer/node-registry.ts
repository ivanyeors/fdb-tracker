import type { GraphNodeType } from "@/lib/developer/calculation-graph-data"

// Port data types for type-safe connections
export type PortDataType =
  | "currency" // Dollar amounts
  | "rate" // Percentages / rates
  | "balance" // Account balances
  | "event" // Triggers / signals
  | "projection" // Forecast data
  | "any" // Compatible with everything

export interface PortDefinition {
  id: string
  label: string
  dataType: PortDataType
  position: "left" | "right"
}

export interface NodeTypeDefinition {
  type: GraphNodeType
  label: string
  color: string
  description: string
  icon: string // Lucide icon name
  defaultInputs: PortDefinition[]
  defaultOutputs: PortDefinition[]
}

// Port type compatibility matrix
const COMPATIBLE_TYPES: Record<PortDataType, PortDataType[]> = {
  currency: ["currency", "balance", "any"],
  rate: ["rate", "any"],
  balance: ["balance", "currency", "any"],
  event: ["event", "any"],
  projection: ["projection", "balance", "any"],
  any: ["currency", "rate", "balance", "event", "projection", "any"],
}

export function arePortsCompatible(
  sourceType: PortDataType,
  targetType: PortDataType
): boolean {
  return (
    COMPATIBLE_TYPES[sourceType]?.includes(targetType) ||
    COMPATIBLE_TYPES[targetType]?.includes(sourceType) ||
    false
  )
}

export const PORT_TYPE_COLORS: Record<PortDataType, string> = {
  currency: "#10b981", // emerald
  rate: "#f59e0b", // amber
  balance: "#3b82f6", // blue
  event: "#8b5cf6", // violet
  projection: "#06b6d4", // cyan
  any: "#6b7280", // gray
}

// Node type definitions for the registry
export const NODE_TYPE_REGISTRY: Record<GraphNodeType, NodeTypeDefinition> = {
  cashflow: {
    type: "cashflow",
    label: "Cashflow",
    color: "#06b6d4",
    description: "Income, inflows, and outflows",
    icon: "ArrowLeftRight",
    defaultInputs: [
      {
        id: "in_currency",
        label: "Amount",
        dataType: "currency",
        position: "left",
      },
    ],
    defaultOutputs: [
      {
        id: "out_currency",
        label: "Amount",
        dataType: "currency",
        position: "right",
      },
    ],
  },
  cpf: {
    type: "cpf",
    label: "CPF",
    color: "#8b5cf6",
    description: "Central Provident Fund calculations",
    icon: "Landmark",
    defaultInputs: [
      {
        id: "in_currency",
        label: "Salary",
        dataType: "currency",
        position: "left",
      },
    ],
    defaultOutputs: [
      {
        id: "out_balance",
        label: "Balance",
        dataType: "balance",
        position: "right",
      },
      { id: "out_rate", label: "Rate", dataType: "rate", position: "right" },
    ],
  },
  tax: {
    type: "tax",
    label: "Tax",
    color: "#f59e0b",
    description: "Tax computation and reliefs",
    icon: "Receipt",
    defaultInputs: [
      {
        id: "in_currency",
        label: "Income",
        dataType: "currency",
        position: "left",
      },
      {
        id: "in_relief",
        label: "Relief",
        dataType: "currency",
        position: "left",
      },
    ],
    defaultOutputs: [
      {
        id: "out_currency",
        label: "Tax",
        dataType: "currency",
        position: "right",
      },
    ],
  },
  bank: {
    type: "bank",
    label: "Bank",
    color: "#3b82f6",
    description: "Bank balances and interest",
    icon: "Building2",
    defaultInputs: [
      {
        id: "in_balance",
        label: "Balance",
        dataType: "balance",
        position: "left",
      },
      { id: "in_rate", label: "Rate", dataType: "rate", position: "left" },
    ],
    defaultOutputs: [
      {
        id: "out_balance",
        label: "Balance",
        dataType: "balance",
        position: "right",
      },
      {
        id: "out_projection",
        label: "Forecast",
        dataType: "projection",
        position: "right",
      },
    ],
  },
  loan: {
    type: "loan",
    label: "Loan",
    color: "#ef4444",
    description: "Loan amortization and repayment",
    icon: "HandCoins",
    defaultInputs: [
      {
        id: "in_currency",
        label: "Principal",
        dataType: "currency",
        position: "left",
      },
      { id: "in_rate", label: "Rate", dataType: "rate", position: "left" },
    ],
    defaultOutputs: [
      {
        id: "out_currency",
        label: "Payment",
        dataType: "currency",
        position: "right",
      },
      {
        id: "out_balance",
        label: "Outstanding",
        dataType: "balance",
        position: "right",
      },
    ],
  },
  investment: {
    type: "investment",
    label: "Investment",
    color: "#10b981",
    description: "ILP, fund values, and holdings",
    icon: "TrendingUp",
    defaultInputs: [
      {
        id: "in_currency",
        label: "Premium",
        dataType: "currency",
        position: "left",
      },
    ],
    defaultOutputs: [
      {
        id: "out_balance",
        label: "Value",
        dataType: "balance",
        position: "right",
      },
    ],
  },
  insurance: {
    type: "insurance",
    label: "Insurance",
    color: "#ec4899",
    description: "Insurance premiums and coverage",
    icon: "Shield",
    defaultInputs: [
      {
        id: "in_currency",
        label: "Income",
        dataType: "currency",
        position: "left",
      },
    ],
    defaultOutputs: [
      {
        id: "out_currency",
        label: "Premium",
        dataType: "currency",
        position: "right",
      },
    ],
  },
  goal: {
    type: "goal",
    label: "Goal",
    color: "#84cc16",
    description: "Savings goal tracking",
    icon: "Target",
    defaultInputs: [
      {
        id: "in_balance",
        label: "Savings",
        dataType: "balance",
        position: "left",
      },
    ],
    defaultOutputs: [
      {
        id: "out_projection",
        label: "Progress",
        dataType: "projection",
        position: "right",
      },
    ],
  },
}
