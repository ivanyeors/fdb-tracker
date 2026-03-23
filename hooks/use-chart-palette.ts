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

function isDark() {
  return document.documentElement.classList.contains("dark")
}

function applyColors(palette: ChartPalette) {
  const s = document.documentElement.style
  const dark = isDark()

  palette.colors.forEach((c, i) => s.setProperty(`--chart-${i + 1}`, c))
  s.setProperty("--chart-positive", dark ? palette.positiveDark : palette.positive)
  s.setProperty("--chart-negative", dark ? palette.negativeDark : palette.negative)
  s.setProperty("--chart-neutral", dark ? palette.neutralDark : palette.neutral)
}

function removeOverrides() {
  const s = document.documentElement.style
  for (let i = 1; i <= 5; i++) s.removeProperty(`--chart-${i}`)
  s.removeProperty("--chart-positive")
  s.removeProperty("--chart-negative")
  s.removeProperty("--chart-neutral")
}

/** Resolve palette from localStorage (preset or stored custom). */
function resolvePalette(): ChartPalette | null {
  const id = localStorage.getItem(LS_PALETTE_KEY)
  if (!id || id === "green") return null

  const preset = PALETTE_MAP.get(id)
  if (preset) return preset

  const raw = localStorage.getItem(LS_PALETTE_COLORS_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as ChartPalette
    } catch {
      return null
    }
  }
  return null
}

/** Read palette from localStorage and apply CSS overrides. */
export function applyChartPalette() {
  const palette = resolvePalette()
  if (palette) {
    applyColors(palette)
  } else {
    removeOverrides()
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

  // Hydrate from localStorage on mount + observe dark mode toggles
  useEffect(() => {
    const id = localStorage.getItem(LS_PALETTE_KEY) ?? "green"
    setPaletteIdState(id)

    if (id === "random") {
      const raw = localStorage.getItem(LS_PALETTE_COLORS_KEY)
      if (raw) {
        try {
          const p = JSON.parse(raw) as ChartPalette
          setRandomColors(p.colors)
        } catch {
          // ignore
        }
      }
    }

    applyChartPalette()

    // Re-apply when dark/light mode toggles (class change on <html>)
    const observer = new MutationObserver(() => applyChartPalette())
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])

  const setPalette = useCallback((palette: ChartPalette) => {
    localStorage.setItem(LS_PALETTE_KEY, palette.id)

    if (palette.id === "random") {
      localStorage.setItem(LS_PALETTE_COLORS_KEY, JSON.stringify(palette))
      setRandomColors(palette.colors)
    }

    setPaletteIdState(palette.id)

    if (palette.id === "green") {
      removeOverrides()
    } else {
      applyColors(palette)
    }
  }, [])

  return { paletteId, randomColors, setPalette }
}
