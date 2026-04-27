"use client"

import { useEffect, useState } from "react"
import { Check, Dices } from "lucide-react"

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

function ColorBar({ palette }: { readonly palette: ChartPalette }) {
  return (
    <div className="flex h-8 w-full overflow-hidden rounded-md">
      {palette.colors.map((c, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  )
}

function SemanticDots({ palette }: { readonly palette: ChartPalette }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: palette.positive }}
        />
        Positive
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: palette.negative }}
        />
        Negative
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: palette.neutral }}
        />
        Neutral
      </span>
    </div>
  )
}

function PaletteCard({
  palette,
  selected,
  onClick,
  children,
}: {
  readonly palette: ChartPalette | null
  readonly selected: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border-2 p-4 text-left transition-colors hover:bg-accent/50",
        selected ? "border-primary bg-accent/30" : "border-muted"
      )}
    >
      {selected && (
        <div className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </div>
      )}
      {children}
    </button>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PRESET_PALETTES.map((p) => (
            <PaletteCard
              key={p.id}
              palette={p}
              selected={paletteId === p.id}
              onClick={() => setPalette(p)}
            >
              <ColorBar palette={p} />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{p.name}</span>
                <SemanticDots palette={p} />
              </div>
            </PaletteCard>
          ))}

          {/* Random palette generator */}
          <PaletteCard
            palette={lastRandom}
            selected={paletteId === "random"}
            onClick={handleRandom}
          >
            {lastRandom ? (
              <ColorBar palette={lastRandom} />
            ) : (
              <div className="flex h-8 w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/50">
                <span className="text-xs text-muted-foreground">
                  Click to generate
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Dices className="size-4 text-muted-foreground" />
                Random
              </span>
              {lastRandom ? (
                <SemanticDots palette={lastRandom} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  Generates a unique palette each time
                </span>
              )}
            </div>
          </PaletteCard>
        </div>
      </CardContent>
    </Card>
  )
}
