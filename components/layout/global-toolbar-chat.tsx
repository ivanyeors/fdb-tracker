"use client"

import { Bot, ExternalLink, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

export function GlobalToolbarChat({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const telegramUrl = TELEGRAM_BOT_USERNAME
    ? `https://t.me/${TELEGRAM_BOT_USERNAME}`
    : null

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
              Assistant
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
              behalf. For now, the Telegram bot remains the fastest way to log
              transactions on the go.
            </p>
          </div>
          {telegramUrl ? (
            <Button asChild variant="outline" className="w-full">
              <a href={telegramUrl} target="_blank" rel="noreferrer noopener">
                <Bot className="h-4 w-4" />
                Open Telegram bot
                <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-60" />
              </a>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Telegram bot username is not configured. Ask an admin to set
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
                NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
              </code>
              .
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
