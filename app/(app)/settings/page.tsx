import { ChartPaletteSelector } from "./chart-palette-selector"
import { ThemeSelector } from "./theme-selector"

export default function GeneralSettingsPage() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">General Settings</h1>
        <p className="text-muted-foreground mt-1">
          Theme, chart colors, and data export.
        </p>
      </div>

      <ThemeSelector />
      <ChartPaletteSelector />
    </div>
  )
}
