"use client"

import { useActiveProfile } from "@/hooks/use-active-profile"
import { GiroRulesForm } from "./giro-rules-form"

export default function GiroSettingsPage() {
  const { activeFamilyId } = useActiveProfile()

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">GIRO Rules</h1>
        <p className="text-muted-foreground mt-1">
          Set up recurring monthly transfers from a bank account to outflow,
          investments, CPF, SRS, or another bank account.
        </p>
      </div>

      <GiroRulesForm familyId={activeFamilyId} />
    </div>
  )
}
