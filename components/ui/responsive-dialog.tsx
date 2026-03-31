"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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

function ResponsiveDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const isMobile = useIsMobile()
  if (isMobile) return <Drawer {...props} />
  return <Dialog {...props} />
}

function ResponsiveDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  const isMobile = useIsMobile()
  if (isMobile) return <DrawerTrigger {...props} />
  return <DialogTrigger {...props} />
}

function ResponsiveDialogClose({
  ...props
}: React.ComponentProps<typeof DialogClose>) {
  const isMobile = useIsMobile()
  if (isMobile) return <DrawerClose {...props} />
  return <DialogClose {...props} />
}

function ResponsiveDialogContent({
  className,
  children,
  showCloseButton,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <DrawerContent
        className={cn("max-h-[85vh]", className)}
        {...(props as React.ComponentProps<typeof DrawerContent>)}
      >
        {children}
      </DrawerContent>
    )
  }
  return (
    <DialogContent className={className} showCloseButton={showCloseButton} {...props}>
      {children}
    </DialogContent>
  )
}

function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile()
  if (isMobile) return <DrawerHeader className={className} {...props} />
  return <DialogHeader className={className} {...props} />
}

function ResponsiveDialogFooter({
  className,
  children,
  showCloseButton,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <DrawerFooter className={className} {...(props as React.ComponentProps<typeof DrawerFooter>)}>
        {children}
      </DrawerFooter>
    )
  }
  return (
    <DialogFooter className={className} showCloseButton={showCloseButton} {...props}>
      {children}
    </DialogFooter>
  )
}

function ResponsiveDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useIsMobile()
  if (isMobile)
    return <DrawerTitle className={className} {...(props as React.ComponentProps<typeof DrawerTitle>)} />
  return <DialogTitle className={className} {...props} />
}

function ResponsiveDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = useIsMobile()
  if (isMobile)
    return (
      <DrawerDescription
        className={className}
        {...(props as React.ComponentProps<typeof DrawerDescription>)}
      />
    )
  return <DialogDescription className={className} {...props} />
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
}
