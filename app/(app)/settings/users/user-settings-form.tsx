"use client"

import { useActionState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateUserProfile, UpdateUserState } from "../actions"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

type ProfileWithIncome = {
  id: string
  name: string
  birth_year: number
  income_config: {
    annual_salary: number
    bonus_estimate: number
    pay_frequency: string
    employee_cpf_rate: number | null
  } | null
}

export function UserSettingsForm({ profile }: { profile: ProfileWithIncome }) {
  const [state, action, isPending] = useActionState(updateUserProfile, {
    success: false,
    error: undefined,
  })

  useEffect(() => {
    if (state.success) {
      toast.success(`${profile.name}'s profile updated successfully`)
    } else if (state.error) {
      toast.error(state.error)
    }
  }, [state, profile.name])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.name}</CardTitle>
        <CardDescription>Update profile and income settings for {profile.name}.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="profileId" value={profile.id} />
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`name-${profile.id}`}>Name</Label>
              <Input
                id={`name-${profile.id}`}
                name="name"
                defaultValue={profile.name}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor={`birthYear-${profile.id}`}>Birth Year</Label>
              <Input
                id={`birthYear-${profile.id}`}
                name="birthYear"
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                defaultValue={profile.birth_year}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div className="space-y-2">
              <Label htmlFor={`annualSalary-${profile.id}`}>Annual Salary ($)</Label>
              <Input
                id={`annualSalary-${profile.id}`}
                name="annualSalary"
                type="number"
                min="0"
                step="0.01"
                defaultValue={profile.income_config?.annual_salary ?? 0}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor={`bonusEstimate-${profile.id}`}>Bonus Estimate ($)</Label>
              <Input
                id={`bonusEstimate-${profile.id}`}
                name="bonusEstimate"
                type="number"
                min="0"
                step="0.01"
                defaultValue={profile.income_config?.bonus_estimate ?? 0}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor={`payFrequency-${profile.id}`}>Pay Frequency</Label>
              <Select name="payFrequency" defaultValue={profile.income_config?.pay_frequency ?? "monthly"}>
                <SelectTrigger id={`payFrequency-${profile.id}`}>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor={`employeeCpfRate-${profile.id}`}>Employee CPF Rate (%)</Label>
              <Input
                id={`employeeCpfRate-${profile.id}`}
                name="employeeCpfRate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                defaultValue={profile.income_config?.employee_cpf_rate ?? ""}
                placeholder="Leave blank for default"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
