"use client"

import { Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function GlobalToolbarChat({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="inset-0! w-full! max-w-none! sm:inset-y-0! sm:left-auto! sm:right-0! sm:w-[420px]! sm:max-w-md!"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b">
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Assistant
            </SheetTitle>
            <SheetDescription>
              An in-app AI assistant is on the way.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close assistant"
              className="h-9 w-9 shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="space-y-4 px-4 py-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Coming soon</p>
            <p className="mt-1 text-muted-foreground">
              We&apos;re building a chat experience that can read your data,
              answer questions about your finances, and take actions on your
              behalf.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
