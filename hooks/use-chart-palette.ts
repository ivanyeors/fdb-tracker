"use client"

import { useCallback, useEffect, useState } from "react"

import {
  type ChartPalette,
  LS_PALETTE_COLORS_KEY,
  LS_PALETTE_KEY,
  PALETTE_MAP,
} from "@/lib/chart-palettes"

// ---------------------------------------------------------------------------
// Apply / remove CSS variable overrides on :root
// ---------------------------------------------------------------------------

const CSS_VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const

function applyColors(colors: ChartPalette["colors"]) {
  const style = document.documentElement.style
  colors.forEach((c, i) => style.setProperty(CSS_VARS[i], c))
}

function removeOverrides() {
  const style = document.documentElement.style
  CSS_VARS.forEach((v) => style.removeProperty(v))
}

/** Read palette from localStorage and apply CSS overrides. */
export function applyChartPalette() {
  const id = localStorage.getItem(LS_PALETTE_KEY)

  if (!id || id === "green") {
    removeOverrides()
    return
  }

  const preset = PALETTE_MAP.get(id)
  if (preset) {
    applyColors(preset.colors)
    return
  }

  // Random / custom — colors stored separately
  const raw = localStorage.getItem(LS_PALETTE_COLORS_KEY)
  if (raw) {
    try {
      const colors = JSON.parse(raw) as ChartPalette["colors"]
      applyColors(colors)
    } catch {
      removeOverrides()
    }
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useChartPalette() {
  const [paletteId, setPaletteIdState] = useState<string>("green")
  const [randomColors, setRandomColors] = useState<
    ChartPalette["colors"] | null
  >(null)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const id = localStorage.getItem(LS_PALETTE_KEY) ?? "green"
    setPaletteIdState(id)

    if (id === "random") {
      const raw = localStorage.getItem(LS_PALETTE_COLORS_KEY)
      if (raw) {
        try {
          setRandomColors(JSON.parse(raw))
        } catch {
          // ignore
        }
      }
    }

    applyChartPalette()
  }, [])

  const setPalette = useCallback(
    (palette: ChartPalette) => {
      localStorage.setItem(LS_PALETTE_KEY, palette.id)

      if (palette.id === "random") {
        localStorage.setItem(
          LS_PALETTE_COLORS_KEY,
          JSON.stringify(palette.colors)
        )
        setRandomColors(palette.colors)
      }

      setPaletteIdState(palette.id)

      if (palette.id === "green") {
        removeOverrides()
      } else {
        applyColors(palette.colors)
      }
    },
    []
  )

  return { paletteId, randomColors, setPalette }
}
