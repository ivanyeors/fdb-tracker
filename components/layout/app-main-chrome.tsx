"use client"

import type { ReactNode } from "react"
import { Header } from "@/components/layout/header"
import { BottomNav } from "@/components/layout/bottom-nav"
import { UserSettingsSaveProvider } from "@/components/layout/user-settings-save-context"

export function AppMainChrome({ children }: { children: ReactNode }) {
  return (
    <UserSettingsSaveProvider>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <Header />
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-16 md:pb-0">
          {children}
        </div>
        <BottomNav />
      </div>
    </UserSettingsSaveProvider>
  )
}
