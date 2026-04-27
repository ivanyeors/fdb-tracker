"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, HelpCircle, Loader2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BirthDatePicker } from "@/components/ui/birth-date-picker"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useOnboarding,
  pathWithMode,
  type Profile,
} from "@/components/onboarding/onboarding-provider"
import { profilesSchema } from "@/lib/validations/onboarding"
import { toast } from "sonner"

export default function ProfilesPage() {
  const router = useRouter()
  const { mode, userCount, profiles, setProfiles, familyId, setFamilyId, skipOnboarding } = useOnboarding()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateProfile(index: number, field: keyof Profile, value: string) {
    const updated = [...profiles]
    if (field === "birth_year") {
      updated[index] = { ...updated[index], birth_year: value ? Number(value) : null }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setProfiles(updated)
  }

  async function handleNext() {
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
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          familyId,
          profiles: data.map((p) => ({
            name: p.name || "Person",
            birth_year: p.birth_year ?? 1990,
          })),
        }),
      })
      const resData = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(resData.message ?? resData.error ?? "Failed to save")
      if (resData.familyId) setFamilyId(resData.familyId)
      toast.success("Profiles saved")
      router.push(pathWithMode("/onboarding/income", mode))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
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
          <div key={`profile-row-${i}`} className="space-y-3 rounded-lg border p-4">
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
              <BirthDatePicker
                value={profile.birth_year}
                onChange={(year) =>
                  updateProfile(i, "birth_year", year?.toString() ?? "")
                }
                id={`birth-year-${i}`}
                placeholder="Select birth year"
                aria-invalid={!!errors[`profiles.${i}.birth_year`]}
              />
              {errors[`profiles.${i}.birth_year`] && (
                <p className="text-xs text-destructive">
                  {errors[`profiles.${i}.birth_year`]}
                </p>
              )}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/users", mode))}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={isLoading}>
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="link"
            className="ml-auto text-muted-foreground"
            onClick={skipOnboarding}
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
