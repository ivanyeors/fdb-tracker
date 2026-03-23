/**
 * Chart color palette definitions and smart-random generator.
 *
 * All colors are OKLCH strings applied as CSS variable overrides on :root.
 * The 5 category colors (chart-1…chart-5) are customizable; positive/negative/neutral
 * remain semantic and are NOT affected by palette selection.
 */

export type ChartPalette = {
  id: string
  name: string
  /** Five OKLCH values for --chart-1 … --chart-5 */
  colors: [string, string, string, string, string]
}

// ---------------------------------------------------------------------------
// Sequential helpers (single-hue palettes with 5 lightness steps)
// ---------------------------------------------------------------------------

function sequential(
  hue: number,
  chroma: number = 0.2
): [string, string, string, string, string] {
  // L steps from bright to dark, matching the existing green palette structure
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
  },
  {
    id: "blue",
    name: "Blue Ocean",
    colors: sequential(240, 0.24),
  },
  {
    id: "sunset",
    name: "Warm Sunset",
    colors: sequential(35, 0.22),
  },
  {
    id: "purple",
    name: "Purple Violet",
    colors: sequential(300, 0.22),
  },
  {
    id: "earth",
    name: "Earth Tones",
    colors: sequential(75, 0.14),
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
  },
]

export const PALETTE_MAP = new Map(PRESET_PALETTES.map((p) => [p.id, p]))

// ---------------------------------------------------------------------------
// Smart-random palette generator (golden-angle hue distribution)
// ---------------------------------------------------------------------------

const GOLDEN_ANGLE = 137.508

export function generateRandomPalette(): ChartPalette {
  const startHue = Math.random() * 360
  const colors = Array.from(
    { length: 5 },
    (_, i) => `oklch(0.55 0.22 ${((startHue + i * GOLDEN_ANGLE) % 360).toFixed(1)})`
  ) as [string, string, string, string, string]

  return { id: "random", name: "Random", colors }
}

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

export const LS_PALETTE_KEY = "fdb-chart-palette"
export const LS_PALETTE_COLORS_KEY = "fdb-chart-palette-colors"
