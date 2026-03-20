"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type CpfLoanRow = {
  id: string
  name: string
  type: string
  principal: number
  rate_pct: number
  tenure_months: number
  start_date: string
  lender: string | null
  use_cpf_oa: boolean
  valuation_limit?: number | null
}

function monthlyPayment(principal: number, annualRate: number, tenureMonths: number) {
  if (tenureMonths <= 0) return 0
  if (annualRate === 0) return principal / tenureMonths
  const r = annualRate / 100 / 12
  return (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1)
}

export function CpfLoansTab({ loans }: { loans: CpfLoanRow[] }) {
  const cpfLoans = loans.filter((l) => l.use_cpf_oa)

  if (cpfLoans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loans using CPF OA</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No loans flagged for CPF OA. Enable <strong>Uses CPF OA</strong> on a housing loan in{" "}
          <Link href="/settings/users" className="text-primary underline">
            User Settings
          </Link>
          .
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bank loan schedule is separate from how much CPF OA you use each month. Log OA withdrawals
        under the <strong>Housing</strong> tab. Full loan list:{" "}
        <Link href="/dashboard/loans" className="text-primary underline">
          Loans
        </Link>
        .
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CPF OA loans</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loan</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Monthly PMT</TableHead>
                <TableHead className="text-right">VL (est.)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cpfLoans.map((l) => {
                const pmt = monthlyPayment(l.principal, l.rate_pct, l.tenure_months)
                const vl = l.valuation_limit ?? null
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      {l.lender && (
                        <div className="text-xs text-muted-foreground">{l.lender}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${formatCurrency(l.principal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.rate_pct}%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${formatCurrency(pmt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {vl != null && vl > 0 ? `$${formatCurrency(vl)}` : "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Button variant="outline" asChild>
        <Link href="/dashboard/loans">Open Loans page</Link>
      </Button>
    </div>
  )
}
