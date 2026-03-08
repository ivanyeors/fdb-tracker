import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function LoansPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Loans</h1>
      <p className="text-muted-foreground mt-1">
        Loan tracking, repayments, and interest calculator.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent>
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
