"use client"

import { useEffect, useRef, useState } from "react"
import { usePageLoading } from "@/hooks/use-page-loading"

export function PageLoadingBar() {
  const { progress, isLoading } = usePageLoading()
  const [visible, setVisible] = useState(isLoading)
  const [opacity, setOpacity] = useState(1)
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    if (hideTimer.current) clearTimeout(hideTimer.current)

    if (isLoading) {
      setVisible(true)
      setOpacity(1)
    } else if (progress === 100) {
      // Completed — hold at 100% briefly, then fade out
      setOpacity(1)
      fadeTimer.current = setTimeout(() => {
        setOpacity(0)
        hideTimer.current = setTimeout(() => {
          setVisible(false)
        }, 200)
      }, 300)
    }

    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [isLoading, progress])

  if (!visible) return null

  return (
    <div className="relative h-0 w-full overflow-visible" aria-hidden>
      <div
        className="absolute inset-x-0 top-0 z-20 h-[2px] bg-primary"
        style={{
          transform: `scaleX(${progress / 100})`,
          transformOrigin: "left",
          transition: "transform 300ms ease-out, opacity 200ms ease-out",
          opacity,
        }}
      />
    </div>
  )
}
