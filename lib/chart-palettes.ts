/**
 * Chart color palette definitions and smart-random generator.
 *
 * Each palette defines 8 colors in OKLCH, applied as CSS variable overrides:
 *   - 5 category colors (--chart-1 … --chart-5): analogous lightness steps
 *   - positive / negative / neutral: semantic colors blended toward the
 *     palette's base hue for visual harmony
 *
 * Dark mode gets lighter semantic variants for readability on dark backgrounds.
 */

export type ChartPalette = {
  id: string
  name: string
  /** Five OKLCH values for --chart-1 … --chart-5 */
  colors: [string, string, string, string, string]
  /** Semantic colors (light mode) */
  positive: string
  negative: string
  neutral: string
  /** Semantic colors (dark mode — higher lightness for readability) */
  positiveDark: string
  negativeDark: string
  neutralDark: string
}

// ---------------------------------------------------------------------------
// Hue blending (shortest-arc lerp on the 0-360 wheel)
// ---------------------------------------------------------------------------

function lerpHue(from: number, to: number, t: number): number {
  let diff = ((to - from + 540) % 360) - 180
  return ((from + diff * t) % 360 + 360) % 360
}

function oklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`
}

// ---------------------------------------------------------------------------
// Derive semantic colors from a base hue
// ---------------------------------------------------------------------------

const POSITIVE_TARGET_HUE = 145
const NEGATIVE_TARGET_HUE = 25

function semanticColors(baseHue: number) {
  const posHue = lerpHue(baseHue, POSITIVE_TARGET_HUE, 0.7)
  const negHue = lerpHue(baseHue, NEGATIVE_TARGET_HUE, 0.7)

  return {
    positive: oklch(0.65, 0.19, posHue),
    negative: oklch(0.58, 0.22, negHue),
    neutral: oklch(0.55, 0.02, baseHue),
    positiveDark: oklch(0.72, 0.17, posHue),
    negativeDark: oklch(0.70, 0.19, negHue),
    neutralDark: oklch(0.65, 0.02, baseHue),
  }
}

// ---------------------------------------------------------------------------
// Sequential helpers (single-hue palettes with 5 lightness steps)
// ---------------------------------------------------------------------------

function sequential(
  hue: number,
  chroma: number = 0.2
): [string, string, string, string, string] {
  const steps: [number, number][] = [
    [0.897, 0.196],
    [0.768, 0.233],
    [0.648, 0.2],
    [0.532, 0.157],
    [0.453, 0.124],
  ]
  return steps.map(
    ([l, c]) => `oklch(${l} ${Math.min(c, chroma)} ${hue})`
  ) as [string, string, string, string, string]
}

// ---------------------------------------------------------------------------
// Preset palettes
// ---------------------------------------------------------------------------

export const PRESET_PALETTES: ChartPalette[] = [
  {
    id: "green",
    name: "Green",
    colors: [
      "oklch(0.897 0.196 126.665)",
      "oklch(0.768 0.233 130.85)",
      "oklch(0.648 0.2 131.684)",
      "oklch(0.532 0.157 131.589)",
      "oklch(0.453 0.124 130.933)",
    ],
    ...semanticColors(129),
  },
  {
    id: "blue",
    name: "Blue Ocean",
    colors: sequential(240, 0.24),
    ...semanticColors(240),
  },
  {
    id: "sunset",
    name: "Warm Sunset",
    colors: sequential(35, 0.22),
    ...semanticColors(35),
  },
  {
    id: "purple",
    name: "Purple Violet",
    colors: sequential(300, 0.22),
    ...semanticColors(300),
  },
  {
    id: "earth",
    name: "Earth Tones",
    colors: sequential(75, 0.14),
    ...semanticColors(75),
  },
  {
    id: "rainbow",
    name: "Rainbow",
    colors: [
      "oklch(0.65 0.22 30)",
      "oklch(0.65 0.22 102)",
      "oklch(0.65 0.22 174)",
      "oklch(0.65 0.22 246)",
      "oklch(0.65 0.22 318)",
    ],
    ...semanticColors(174), // center hue of the spread
  },
  {
    id: "muted",
    name: "Muted",
    colors: [
      "oklch(0.6 0.12 250)",
      "oklch(0.6 0.12 35)",
      "oklch(0.6 0.12 160)",
      "oklch(0.6 0.12 310)",
      "oklch(0.6 0.12 90)",
    ],
    ...semanticColors(170),
  },
]

export const PALETTE_MAP = new Map(PRESET_PALETTES.map((p) => [p.id, p]))

// ---------------------------------------------------------------------------
// Smart-random palette generator (golden-angle hue distribution)
// ---------------------------------------------------------------------------

const GOLDEN_ANGLE = 137.508

export function generateRandomPalette(): ChartPalette {
  const startHue = Math.random() * 360
  const hues = Array.from(
    { length: 5 },
    (_, i) => (startHue + i * GOLDEN_ANGLE) % 360
  )
  const colors = hues.map(
    (h) => `oklch(0.55 0.22 ${h.toFixed(1)})`
  ) as [string, string, string, string, string]

  // Average hue (circular mean) for deriving semantic colors
  const sinSum = hues.reduce((s, h) => s + Math.sin((h * Math.PI) / 180), 0)
  const cosSum = hues.reduce((s, h) => s + Math.cos((h * Math.PI) / 180), 0)
  const avgHue = ((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360

  return { id: "random", name: "Random", colors, ...semanticColors(avgHue) }
}

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

export const LS_PALETTE_KEY = "fdb-chart-palette"
export const LS_PALETTE_COLORS_KEY = "fdb-chart-palette-colors"
