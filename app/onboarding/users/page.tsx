"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useOnboarding } from "@/components/onboarding/onboarding-provider"
import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight } from "lucide-react"

const COUNTS = [1, 2, 3, 4, 5, 6] as const

export default function UsersPage() {
  const router = useRouter()
  const { userCount, setUserCount } = useOnboarding()

  return (
    <Card>
      <CardHeader>
        <CardTitle>How many people will be tracking?</CardTitle>
        <CardDescription>
          Select the number of household members who will track their finances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((count) => (
            <Button
              key={count}
              variant={userCount === count ? "default" : "outline"}
              size="lg"
              className={cn("min-w-12", userCount === count && "ring-2 ring-primary/50")}
              onClick={() => setUserCount(count)}
            >
              {count}
            </Button>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/onboarding")}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={() => router.push("/onboarding/profiles")}>
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
