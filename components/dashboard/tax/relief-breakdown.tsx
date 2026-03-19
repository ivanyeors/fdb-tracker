"use client"

import { formatCurrency } from "@/lib/utils"
import { applyProgressiveBrackets } from "@/lib/calculations/tax"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const MONEY_FLOW: Record<string, string> = {
  earned_income: "N/A (auto)",
  cpf: "CPF accounts",
  life_insurance: "Insurance policy",
  srs: "SRS account",
  cpf_topup_self: "CPF SA/RA",
  cpf_topup_family: "Family CPF SA/RA",
  donations: "Approved IPC charity",
  course_fees: "Education",
  parent: "N/A",
  spouse: "N/A",
  wmcr: "N/A",
  other: "—",
}

function formatReliefType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface ReliefRow {
  id: string
  profile_id: string
  year: number
  relief_type: string
  amount: number
  source?: "auto" | "manual"
}

interface ReliefBreakdownProps {
  reliefs: ReliefRow[]
  profileName?: string
  taxPayable: number
  /** Employment income (for tax-saved estimate) */
  employmentIncome?: number
}

export function ReliefBreakdown({
  reliefs,
  profileName,
  taxPayable,
  employmentIncome = 0,
}: ReliefBreakdownProps) {
  const totalReliefs = reliefs.reduce((s, r) => s + r.amount, 0)
  const taxWithoutReliefs =
    employmentIncome > 0 ? applyProgressiveBrackets(employmentIncome, new Date().getFullYear()) : 0
  const totalTaxSaved = Math.max(0, taxWithoutReliefs - taxPayable)

  return (
    <div className="space-y-2">
      {profileName && (
        <p className="text-sm font-medium text-muted-foreground">{profileName}</p>
      )}
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Relief</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Tax Saved</TableHead>
          <TableHead>Where Money Flowed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reliefs.map((relief) => {
          const reliefPct = totalReliefs > 0 ? relief.amount / totalReliefs : 0
          const taxSaved = totalReliefs > 0 ? totalTaxSaved * reliefPct : 0
          return (
            <TableRow key={relief.id}>
              <TableCell className="font-medium">
                {formatReliefType(relief.relief_type)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={relief.source === "auto" ? "secondary" : "outline"}
                  className={
                    relief.source === "auto"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                  }
                >
                  {relief.source ?? "manual"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                ${formatCurrency(relief.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                ~${formatCurrency(taxSaved)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {MONEY_FLOW[relief.relief_type] ?? "—"}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    </div>
  )
}
