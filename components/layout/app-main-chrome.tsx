"use client"

import type { ReactNode } from "react"
import { Header } from "@/components/layout/header"
import { BottomNav } from "@/components/layout/bottom-nav"
import { PageLoadingBar } from "@/components/layout/page-loading-bar"
import { PageLoadingProvider } from "@/hooks/use-page-loading"
import { UserSettingsSaveProvider } from "@/components/layout/user-settings-save-context"

export function AppMainChrome({ children }: { children: ReactNode }) {
  return (
    <UserSettingsSaveProvider>
      <PageLoadingProvider>
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
          <Header />
          <PageLoadingBar />
          <div
            id="main-scroll-container"
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-24 md:pb-0"
          >
            {children}
          </div>
          <BottomNav />
        </div>
      </PageLoadingProvider>
    </UserSettingsSaveProvider>
  )
}
