"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Loader2, MessageSquare, Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUserSettingsSave } from "@/components/layout/user-settings-save-context"
import { CombinedImpactConfirmationDialog } from "@/components/ui/combined-impact-confirmation-dialog"
import type { ImpactNodeId } from "@/lib/impact-graph"
import { useIsMobile } from "@/hooks/use-mobile"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { getToolbarConfig } from "@/lib/global-toolbar/config"
import { cn } from "@/lib/utils"

import { GlobalToolbarSearch } from "./global-toolbar-search"
import { GlobalToolbarChat } from "./global-toolbar-chat"

export function GlobalToolbar() {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const scrollDir = useScrollDirection()
  const config = getToolbarConfig(pathname)
  const isSaveMode = config.saveContext === "user-settings"
  const hidden = scrollDir === "down"

  const [searchOpen, setSearchOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [ctaOpen, setCtaOpen] = useState(false)

  // cmd/ctrl+k toggles search globally.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed left-1/2 z-40 -translate-x-1/2 transition-[bottom] duration-200 ease-out",
          getToolbarBottomClass(isMobile, hidden)
        )}
      >
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-1 rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur-md supports-backdrop-filter:bg-background/75"
          )}
        >
          <ToolbarIconButton
            label="Search (⌘K)"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </ToolbarIconButton>

          <ToolbarIconButton
            label="Assistant"
            onClick={() => setChatOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
          </ToolbarIconButton>

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          {isSaveMode ? (
            <SaveButton />
          ) : (
            <CtaButton
              ctas={config.ctas}
              open={ctaOpen}
              onOpenChange={setCtaOpen}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      <GlobalToolbarSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <GlobalToolbarChat open={chatOpen} onOpenChange={setChatOpen} />
    </>
  )
}

function getToolbarBottomClass(isMobile: boolean, hidden: boolean): string {
  if (!isMobile) return "bottom-4"
  return hidden
    ? "bottom-[calc(env(safe-area-inset-bottom)+16px)]"
    : "bottom-[calc(env(safe-area-inset-bottom)+88px)]"
}

function ToolbarIconButton({
  label,
  onClick,
  children,
}: {
  readonly label: string
  readonly onClick: () => void
  readonly children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className="h-9 w-9 rounded-full"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function CtaButton({
  ctas,
  open,
  onOpenChange,
  isMobile,
}: {
  readonly ctas: ReturnType<typeof getToolbarConfig>["ctas"]
  readonly open: boolean
  readonly onOpenChange: (next: boolean) => void
  readonly isMobile: boolean
}) {
  if (ctas.length === 0) {
    return null
  }

  const trigger = (
    <Button
      type="button"
      size="sm"
      className="h-9 gap-1.5 rounded-full px-4"
      aria-label="Quick actions"
    >
      <Plus className="h-4 w-4" />
      <span className="hidden sm:inline">Add</span>
    </Button>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Quick actions</DrawerTitle>
            <DrawerDescription>
              Pick what you want to add for this page.
            </DrawerDescription>
          </DrawerHeader>
          <div className="mx-auto flex w-full max-w-md flex-col gap-1 px-4 pb-4">
            {ctas.map((cta) => (
              <DrawerClose asChild key={cta.id}>
                <Link
                  href={cta.href}
                  className="flex items-start gap-3 rounded-lg border bg-card px-3 py-3 text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <cta.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{cta.label}</span>
                    {cta.description ? (
                      <span className="text-xs text-muted-foreground">
                        {cta.description}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </DrawerClose>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-80 max-w-[min(20rem,calc(100vw-1rem))] gap-2 p-3"
      >
        <PopoverHeader>
          <PopoverTitle>Quick actions</PopoverTitle>
          <PopoverDescription>
            Pick what you want to add for this page.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-1">
          {ctas.map((cta) => (
            <Link
              key={cta.id}
              href={cta.href}
              onClick={() => onOpenChange(false)}
              className="flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <cta.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{cta.label}</span>
                {cta.description ? (
                  <span className="text-xs text-muted-foreground">
                    {cta.description}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SaveButton() {
  const { aggregateDirty, saveAll, isSaving, getDirtyImpactNodeIds } =
    useUserSettingsSave()
  const [impactDialogOpen, setImpactDialogOpen] = useState(false)
  const [pendingImpactNodeIds, setPendingImpactNodeIds] = useState<
    ImpactNodeId[]
  >([])

  const handleSave = useCallback(() => {
    const dirtyNodeIds = getDirtyImpactNodeIds()
    if (dirtyNodeIds.length > 0) {
      setPendingImpactNodeIds(dirtyNodeIds)
      setImpactDialogOpen(true)
    } else {
      void saveAll()
    }
  }, [getDirtyImpactNodeIds, saveAll])

  const handleConfirm = useCallback(() => {
    setImpactDialogOpen(false)
    setPendingImpactNodeIds([])
    void saveAll()
  }, [saveAll])

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-9 gap-1.5 rounded-full px-5"
        disabled={!aggregateDirty || isSaving}
        onClick={handleSave}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        Save changes
      </Button>
      <CombinedImpactConfirmationDialog
        open={impactDialogOpen}
        onOpenChange={setImpactDialogOpen}
        sourceNodeIds={pendingImpactNodeIds}
        onConfirm={handleConfirm}
      />
    </>
  )
}
