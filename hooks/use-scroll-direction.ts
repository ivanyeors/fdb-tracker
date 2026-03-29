"use client"

import { useEffect, useRef, useState } from "react"

export function useScrollDirection(
  containerId = "main-scroll-container",
  threshold = 10
): "up" | "down" | null {
  const [direction, setDirection] = useState<"up" | "down" | null>(null)
  const lastY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    const el = document.getElementById(containerId)
    if (!el) return

    lastY.current = el.scrollTop

    function onScroll() {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const y = el!.scrollTop
        const delta = y - lastY.current
        if (Math.abs(delta) >= threshold) {
          setDirection(delta > 0 ? "down" : "up")
          lastY.current = y
        }
        ticking.current = false
      })
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [containerId, threshold])

  return direction
}
