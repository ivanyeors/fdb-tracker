import { ChartPaletteSelector } from "./chart-palette-selector"
import { ThemeSelector } from "./theme-selector"
import { TelegramApiKeysSection } from "./telegram-api-keys-section"

export default function GeneralSettingsPage() {
  return (
    <div className="p-2 sm:p-4 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">General Settings</h1>
        <p className="text-muted-foreground mt-1">
          Theme, chart colors, and integrations.
        </p>
      </div>

      <ThemeSelector />
      <ChartPaletteSelector />

      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Integrations
      </h3>
      <TelegramApiKeysSection />
    </div>
  )
}
