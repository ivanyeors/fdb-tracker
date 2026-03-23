"use client"

import { useEffect, useState } from "react"
import { Dices } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  PRESET_PALETTES,
  generateRandomPalette,
  type ChartPalette,
} from "@/lib/chart-palettes"
import { useChartPalette } from "@/hooks/use-chart-palette"
import { cn } from "@/lib/utils"

function SwatchRow({ palette }: { palette: ChartPalette }) {
  return (
    <div className="flex flex-col gap-1">
      {/* Category colors */}
      <div className="flex gap-1.5">
        {palette.colors.map((c, i) => (
          <span
            key={i}
            className="size-4 rounded-full border border-border/50"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      {/* Semantic colors: positive / negative / neutral */}
      <div className="flex gap-1.5">
        <span
          className="size-3 rounded-full border border-border/50"
          style={{ backgroundColor: palette.positive }}
          title="Positive"
        />
        <span
          className="size-3 rounded-full border border-border/50"
          style={{ backgroundColor: palette.negative }}
          title="Negative"
        />
        <span
          className="size-3 rounded-full border border-border/50"
          style={{ backgroundColor: palette.neutral }}
          title="Neutral"
        />
      </div>
    </div>
  )
}

export function ChartPaletteSelector() {
  const { paletteId, randomColors, setPalette } = useChartPalette()
  const [mounted, setMounted] = useState(false)
  const [lastRandom, setLastRandom] = useState<ChartPalette | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)

    // Restore last random palette for swatch display
    if (randomColors) {
      const raw = localStorage.getItem("fdb-chart-palette-colors")
      if (raw) {
        try {
          setLastRandom(JSON.parse(raw) as ChartPalette)
        } catch {
          // ignore
        }
      }
    }
  }, [randomColors])

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chart Colors</CardTitle>
          <CardDescription>
            Choose a color palette for your dashboard charts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-32 items-center justify-center opacity-50">
          Loading palette preferences...
        </CardContent>
      </Card>
    )
  }

  const handleRandom = () => {
    const p = generateRandomPalette()
    setLastRandom(p)
    setPalette(p)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chart Colors</CardTitle>
        <CardDescription>
          Choose a color palette for your dashboard charts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {PRESET_PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPalette(p)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-md border-2 p-3 text-left text-sm transition-colors hover:bg-accent",
                paletteId === p.id ? "border-primary" : "border-muted"
              )}
            >
              <SwatchRow palette={p} />
              <span className="font-medium">{p.name}</span>
            </button>
          ))}

          {/* Random palette generator */}
          <button
            type="button"
            onClick={handleRandom}
            className={cn(
              "flex flex-col items-start gap-2 rounded-md border-2 p-3 text-left text-sm transition-colors hover:bg-accent",
              paletteId === "random" ? "border-primary" : "border-muted"
            )}
          >
            <div className="flex items-center gap-1.5">
              <Dices className="size-4 text-muted-foreground" />
              {lastRandom ? (
                <SwatchRow palette={lastRandom} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  click to generate
                </span>
              )}
            </div>
            <span className="font-medium">Random</span>
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
