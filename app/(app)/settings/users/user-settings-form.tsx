"use client"

import { useActionState, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { updateUserProfile, deleteUserProfile } from "../actions"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
import type { ProfileWithIncome } from "./types"

export function UserSettingsForm({
  profile,
  profileCount,
}: {
  profile: ProfileWithIncome
  profileCount: number
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [state, action, isPending] = useActionState(updateUserProfile, {
    success: false,
    error: undefined,
  })
  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteUserProfile, {
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

  useEffect(() => {
    if (deleteState.success) {
      setDeleteDialogOpen(false)
      toast.success(`${profile.name}'s profile was deleted`)
    } else if (deleteState.error) {
      toast.error(deleteState.error)
    }
  }, [deleteState, profile.name])

  const canDelete = profileCount > 1

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{profile.name}</CardTitle>
            <CardDescription>Update profile and income settings for {profile.name}.</CardDescription>
          </div>
          {canDelete && (
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete profile</span>
                </Button>
              </DialogTrigger>
              <DialogContent showCloseButton={true}>
                <DialogHeader>
                  <DialogTitle>Delete profile</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete {profile.name}? This will remove their profile and
                    associated data (income config, cashflow, CPF, loans, insurance, etc.). Bank accounts
                    and investments linked to this profile will be unlinked but not deleted.
                  </DialogDescription>
                </DialogHeader>
                <form action={deleteAction} className="contents">
                  <input type="hidden" name="profileId" value={profile.id} />
                  <DialogFooter showCloseButton={false}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDeleteDialogOpen(false)}
                      disabled={isDeletePending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="destructive" disabled={isDeletePending}>
                      {isDeletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
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
                  <SelectItem value="bi-monthly">Bi-Monthly</SelectItem>
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
