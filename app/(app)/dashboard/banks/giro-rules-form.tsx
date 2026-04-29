"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ButtonSelect } from "@/components/ui/button-select"
import { Switch } from "@/components/ui/switch"
import {
  ResponsiveSheet as Sheet,
  ResponsiveSheetContent as SheetContent,
  ResponsiveSheetDescription as SheetDescription,
  ResponsiveSheetHeader as SheetHeader,
  ResponsiveSheetTitle as SheetTitle,
} from "@/components/ui/responsive-sheet"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

const DESTINATION_OPTIONS = [
  { value: "outflow", label: "Outflow (spending)" },
  { value: "investments", label: "Investments" },
  { value: "cpf_investments", label: "CPF Investments" },
  { value: "srs", label: "SRS" },
  { value: "bank_account", label: "Transfer to bank account" },
] as const

type GiroRule = {
  id: string
  family_id: string
  profile_id: string | null
  source_bank_account_id: string
  amount: number
  destination_type: string
  destination_bank_account_id: string | null
  is_active: boolean
  created_at: string
}

type BankAccount = {
  id: string
  bank_name: string
  account_type: string
  profile_id: string | null
}

export function GiroRulesForm({ familyId }: { readonly familyId: string | null }) {
  const router = useRouter()
  const [rules, setRules] = useState<GiroRule[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    sourceBankAccountId: string
    amount: number
    destinationType: (typeof DESTINATION_OPTIONS)[number]["value"]
    destinationBankAccountId: string
  }>({
    sourceBankAccountId: "",
    amount: 0,
    destinationType: "investments",
    destinationBankAccountId: "",
  })

  useEffect(() => {
    if (!familyId) {
      setLoading(false)
      return
    }
    async function fetchData() {
      setLoading(true)
      try {
        const [rulesRes, accountsRes] = await Promise.all([
          fetch(`/api/giro-rules?familyId=${familyId}`),
          fetch(`/api/bank-accounts?familyId=${familyId}&minimal=1`),
        ])
        if (rulesRes.ok) {
          const data = await rulesRes.json()
          setRules(data)
        }
        if (accountsRes.ok) {
          const data = await accountsRes.json()
          setBankAccounts(data)
        }
      } catch {
        toast.error("Failed to load GIRO rules")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [familyId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!familyId) {
      toast.error("Please select a family first.")
      return
    }
    if (!form.sourceBankAccountId) {
      toast.error("Please select a source bank account.")
      return
    }
    if (form.amount <= 0) {
      toast.error("Please enter a valid amount.")
      return
    }
    if (
      form.destinationType === "bank_account" &&
      !form.destinationBankAccountId
    ) {
      toast.error("Please select a destination bank account.")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/giro-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          sourceBankAccountId: form.sourceBankAccountId,
          amount: form.amount,
          destinationType: form.destinationType,
          ...(form.destinationType === "bank_account" && {
            destinationBankAccountId: form.destinationBankAccountId,
          }),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to create GIRO rule")
      }
      toast.success("GIRO rule created")
      setForm({
        sourceBankAccountId: "",
        amount: 0,
        destinationType: "investments",
        destinationBankAccountId: "",
      })
      setSheetOpen(false)
      router.refresh()
      const data = await fetch(`/api/giro-rules?familyId=${familyId}`).then(
        (r) => r.json(),
      )
      setRules(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(rule: GiroRule) {
    try {
      const res = await fetch(`/api/giro-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.is_active }),
      })
      if (!res.ok) throw new Error("Failed to update")
      toast.success(rule.is_active ? "GIRO rule paused" : "GIRO rule enabled")
      router.refresh()
      if (familyId) {
        const data = await fetch(`/api/giro-rules?familyId=${familyId}`).then(
          (r) => r.json(),
        )
        setRules(data)
      }
    } catch {
      toast.error("Failed to update GIRO rule")
    }
  }

  async function handleDelete(rule: GiroRule) {
    if (!confirm("Delete this GIRO rule?")) return
    try {
      const res = await fetch(`/api/giro-rules/${rule.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("GIRO rule deleted")
      router.refresh()
      if (familyId) {
        const data = await fetch(`/api/giro-rules?familyId=${familyId}`).then(
          (r) => r.json(),
        )
        setRules(data)
      }
    } catch {
      toast.error("Failed to delete GIRO rule")
    }
  }

  function getAccountLabel(id: string) {
    const acc = bankAccounts.find((a) => a.id === id)
    return acc ? `${acc.bank_name} (${acc.account_type})` : id.slice(0, 8)
  }

  function getDestinationLabel(type: string, destAccountId: string | null) {
    const opt = DESTINATION_OPTIONS.find((o) => o.value === type)
    if (opt) return opt.label
    if (type === "bank_account" && destAccountId) {
      return `Transfer to ${getAccountLabel(destAccountId)}`
    }
    return type
  }

  if (!familyId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">
            Select a family from the switcher above to manage GIRO rules.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recurring GIRO</CardTitle>
          <Button onClick={() => setSheetOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No GIRO rules yet. Add a rule to set up recurring monthly transfers
              from a bank account.
            </p>
          ) : (
            <ul className="space-y-3">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      ${rule.amount.toLocaleString()}/mo from{" "}
                      {getAccountLabel(rule.source_bank_account_id)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      → {getDestinationLabel(rule.destination_type, rule.destination_bank_account_id)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => handleToggleActive(rule)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(rule)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add GIRO rule</SheetTitle>
            <SheetDescription>
              Set up a recurring monthly transfer from a bank account.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Source bank account</Label>
              <Select
                value={form.sourceBankAccountId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, sourceBankAccountId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.bank_name} ({acc.account_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (monthly)</Label>
              <CurrencyInput
                value={form.amount}
                onChange={(v) => setForm((f) => ({ ...f, amount: v ?? 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <ButtonSelect
                value={form.destinationType}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    destinationType: v as (typeof DESTINATION_OPTIONS)[number]["value"],
                    destinationBankAccountId: "",
                  }))
                }
                options={DESTINATION_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
              />
            </div>
            {form.destinationType === "bank_account" && (
              <div className="space-y-2">
                <Label>Destination bank account</Label>
                <Select
                  value={form.destinationBankAccountId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, destinationBankAccountId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts
                      .filter((a) => a.id !== form.sourceBankAccountId)
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.bank_name} ({acc.account_type})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add rule
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
