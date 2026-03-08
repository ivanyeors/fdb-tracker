"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useOnboarding,
  type Profile,
} from "@/components/onboarding/onboarding-provider"
import { profilesSchema } from "@/lib/validations/onboarding"
import { ArrowLeft, ArrowRight, HelpCircle } from "lucide-react"

const YEARS = Array.from({ length: 71 }, (_, i) => 2010 - i)

export default function ProfilesPage() {
  const router = useRouter()
  const { userCount, profiles, setProfiles } = useOnboarding()
  const [errors, setErrors] = useState<Record<string, string>>({})

  function updateProfile(index: number, field: keyof Profile, value: string) {
    const updated = [...profiles]
    if (field === "birth_year") {
      updated[index] = { ...updated[index], birth_year: value ? Number(value) : null }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setProfiles(updated)
  }

  function handleNext() {
    const data = profiles.slice(0, userCount)
    const result = profilesSchema.safeParse({ profiles: data })
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join(".")
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    router.push("/onboarding/income")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up profiles</CardTitle>
        <CardDescription>
          Enter details for each person tracking their finances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {profiles.slice(0, userCount).map((profile, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Person {i + 1}</p>

            <div className="space-y-1.5">
              <Label htmlFor={`name-${i}`}>Name</Label>
              <Input
                id={`name-${i}`}
                placeholder="Enter name"
                value={profile.name}
                onChange={(e) => updateProfile(i, "name", e.target.value)}
                aria-invalid={!!errors[`profiles.${i}.name`]}
              />
              {errors[`profiles.${i}.name`] && (
                <p className="text-xs text-destructive">
                  {errors[`profiles.${i}.name`]}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`birth-year-${i}`}>Birth Year</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-4 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Used for CPF age band calculation
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={profile.birth_year?.toString() ?? ""}
                onValueChange={(v) => updateProfile(i, "birth_year", v)}
              >
                <SelectTrigger id={`birth-year-${i}`} className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors[`profiles.${i}.birth_year`] && (
                <p className="text-xs text-destructive">
                  {errors[`profiles.${i}.birth_year`]}
                </p>
              )}
            </div>
          </div>
        ))}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/onboarding/users")}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={handleNext}>
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
