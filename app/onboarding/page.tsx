import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ArrowRight } from "lucide-react"

export default function WelcomePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Track finances together</CardTitle>
        <CardDescription>
          A few steps to get started. We&apos;ll set up your profiles, income,
          bank accounts, and Telegram integration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="lg">
          <Link href="/onboarding/users">
            Get Started
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
