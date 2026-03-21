import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const dashboardPages = [
  { title: "Overview", href: "/dashboard" },
  { title: "Banks", href: "/dashboard/banks" },
  { title: "CPF", href: "/dashboard/cpf" },
  { title: "Cashflow", href: "/dashboard/cashflow" },
  { title: "Investments", href: "/dashboard/investments" },
  { title: "Savings Goals", href: "/dashboard/banks#savings-goals" },
  { title: "Loans", href: "/dashboard/loans" },
  { title: "Insurance", href: "/dashboard/insurance" },
  { title: "Tax Planner", href: "/dashboard/tax" },
]

const settingsPages = [
  { title: "General", href: "/settings" },
  { title: "User Settings", href: "/settings/users" },
  { title: "Notifications", href: "/settings/notifications" },
  { title: "Setup", href: "/settings/setup" },
]

export default function Page() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            fdb-tracker
          </CardTitle>
          <CardDescription>
            Track your finances, CPF, investments, and savings goals in one
            place.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-medium text-foreground">Dashboard</h3>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-muted-foreground">
                {dashboardPages.map((p) => (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      className="hover:text-foreground hover:underline"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-foreground">Settings</h3>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-muted-foreground">
                {settingsPages.map((p) => (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      className="hover:text-foreground hover:underline"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="font-mono text-xs text-muted-foreground">
            (Press <kbd className="rounded border bg-muted px-1.5 py-0.5">d</kbd>{" "}
            to toggle dark mode)
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
