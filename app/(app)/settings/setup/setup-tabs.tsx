"use client"

import type { ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { IlpFundImportTab } from "@/components/settings/ilp-fund-import-tab"

export function SetupTabsClient({
  children,
  familyId,
}: {
  children: ReactNode
  familyId: string | null
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get("tab") === "ilp" ? "ilp" : "account"

  const onTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (v === "ilp") next.set("tab", "ilp")
    else next.delete("tab")
    const q = next.toString()
    router.push(q ? `/settings/setup?${q}` : "/settings/setup")
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="w-full">
      <TabsList>
        <TabsTrigger value="account">Account &amp; setup</TabsTrigger>
        <TabsTrigger value="ilp">ILP fund report</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="mt-4 space-y-6">
        {children}
      </TabsContent>
      <TabsContent value="ilp" className="mt-4">
        <IlpFundImportTab familyId={familyId} />
      </TabsContent>
    </Tabs>
  )
}
