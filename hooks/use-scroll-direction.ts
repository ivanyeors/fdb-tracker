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
    // On desktop the container scrolls; on mobile the viewport scrolls instead.
    // Detect by checking if the container is actually height-constrained.
    const isContainerScrollable =
      el != null && el.clientHeight > 0 && el.scrollHeight > el.clientHeight
    const target = isContainerScrollable ? el : null

    function getScrollTop() {
      return target ? target.scrollTop : window.scrollY
    }

    lastY.current = getScrollTop()

    function onScroll() {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const y = getScrollTop()
        // Near the top, mobile browsers (iOS URL bar reappearing, rubber-band
        // bounce, padding-top transitions) emit spurious positive deltas that
        // would otherwise hide the topbar exactly when the user scrolls to it.
        const NEAR_TOP = 64
        if (y < NEAR_TOP) {
          lastY.current = y
          setDirection((prev) => (prev === "up" ? prev : "up"))
          ticking.current = false
          return
        }
        const delta = y - lastY.current
        if (Math.abs(delta) >= threshold) {
          setDirection(delta > 0 ? "down" : "up")
          lastY.current = y
        }
        ticking.current = false
      })
    }

    const listenTarget: EventTarget = target || window
    listenTarget.addEventListener("scroll", onScroll, { passive: true })
    return () => listenTarget.removeEventListener("scroll", onScroll)
  }, [containerId, threshold])

  return direction
}
