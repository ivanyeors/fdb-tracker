import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function InvestmentsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Investments</h1>
      <p className="text-muted-foreground mt-1">
        Portfolio overview, allocation, and P&amp;L.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
