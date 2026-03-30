"use client"

import type { ReactNode } from "react"

export function SetupTabsClient({
  children,
}: {
  children: ReactNode
  familyId: string | null
}) {
  return <div className="w-full space-y-6">{children}</div>
}
