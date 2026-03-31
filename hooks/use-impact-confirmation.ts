"use client"

import { useCallback, useRef, useState } from "react"
import {
  type ImpactNodeId,
  hasDownstreamImpacts,
} from "@/lib/impact-graph"
import type { ImpactConfirmationDialogProps } from "@/components/ui/impact-confirmation-dialog"

interface UseImpactConfirmationReturn {
  /** Wrap your submit handler — shows dialog if impacts exist, else runs immediately */
  requestChange: (callback: () => void) => void
  /** Spread onto <ImpactConfirmationDialog /> */
  dialogProps: Pick<
    ImpactConfirmationDialogProps,
    "open" | "onOpenChange" | "sourceNodeId" | "onConfirm" | "overridingAutoValue"
  >
}

export function useImpactConfirmation(
  nodeId: ImpactNodeId,
  options?: { overridingAutoValue?: boolean },
): UseImpactConfirmationReturn {
  const [open, setOpen] = useState(false)
  const pendingCallback = useRef<(() => void) | null>(null)

  const requestChange = useCallback(
    (callback: () => void) => {
      if (!hasDownstreamImpacts(nodeId)) {
        callback()
        return
      }
      pendingCallback.current = callback
      setOpen(true)
    },
    [nodeId],
  )

  const onConfirm = useCallback(() => {
    setOpen(false)
    pendingCallback.current?.()
    pendingCallback.current = null
  }, [])

  const onOpenChange = useCallback((value: boolean) => {
    setOpen(value)
    if (!value) {
      pendingCallback.current = null
    }
  }, [])

  return {
    requestChange,
    dialogProps: {
      open,
      onOpenChange,
      sourceNodeId: nodeId,
      onConfirm,
      overridingAutoValue: options?.overridingAutoValue,
    },
  }
}
