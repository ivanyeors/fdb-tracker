"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

function ResponsiveSheet({
  ...props
}: Readonly<React.ComponentProps<typeof Sheet>>) {
  const isMobile = useIsMobile()
  if (isMobile) return <Drawer {...props} />
  return <Sheet {...props} />
}

function ResponsiveSheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetTrigger>) {
  const isMobile = useIsMobile()
  if (isMobile) return <DrawerTrigger {...props} />
  return <SheetTrigger {...props} />
}

function ResponsiveSheetClose({
  ...props
}: React.ComponentProps<typeof SheetClose>) {
  const isMobile = useIsMobile()
  if (isMobile) return <DrawerClose {...props} />
  return <SheetClose {...props} />
}

function ResponsiveSheetContent({
  className,
  children,
  side,
  showCloseButton,
  ...props
}: React.ComponentProps<typeof SheetContent>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <DrawerContent
        className={cn("max-h-[85vh] overflow-y-auto", className)}
        {...(props as React.ComponentProps<typeof DrawerContent>)}
      >
        {children}
      </DrawerContent>
    )
  }
  return (
    <SheetContent className={className} side={side} showCloseButton={showCloseButton} {...props}>
      {children}
    </SheetContent>
  )
}

function ResponsiveSheetHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile()
  if (isMobile) return <DrawerHeader className={className} {...props} />
  return <SheetHeader className={className} {...props} />
}

function ResponsiveSheetFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile()
  if (isMobile) return <DrawerFooter className={className} {...props} />
  return <SheetFooter className={className} {...props} />
}

function ResponsiveSheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetTitle>) {
  const isMobile = useIsMobile()
  if (isMobile)
    return <DrawerTitle className={className} {...(props as React.ComponentProps<typeof DrawerTitle>)} />
  return <SheetTitle className={className} {...props} />
}

function ResponsiveSheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetDescription>) {
  const isMobile = useIsMobile()
  if (isMobile)
    return (
      <DrawerDescription
        className={className}
        {...(props as React.ComponentProps<typeof DrawerDescription>)}
      />
    )
  return <SheetDescription className={className} {...props} />
}

export {
  ResponsiveSheet,
  ResponsiveSheetTrigger,
  ResponsiveSheetClose,
  ResponsiveSheetContent,
  ResponsiveSheetHeader,
  ResponsiveSheetFooter,
  ResponsiveSheetTitle,
  ResponsiveSheetDescription,
}
