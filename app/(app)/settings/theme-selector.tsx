"use client"

import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useEffect, useState } from "react"

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the theme for your dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="h-32 flex items-center justify-center opacity-50">
          Loading theme preferences...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Customize the theme for your dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          defaultValue={theme}
          onValueChange={(value) => setTheme(value)}
          className="grid max-w-md grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <div>
            <RadioGroupItem value="light" id="theme-light" className="peer sr-only" />
            <Label
              htmlFor="theme-light"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <Sun className="mb-3 h-6 w-6" />
              Light
            </Label>
          </div>
          <div>
            <RadioGroupItem value="dark" id="theme-dark" className="peer sr-only" />
            <Label
              htmlFor="theme-dark"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <Moon className="mb-3 h-6 w-6" />
              Dark
            </Label>
          </div>
          <div>
            <RadioGroupItem value="system" id="theme-system" className="peer sr-only" />
            <Label
              htmlFor="theme-system"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <Monitor className="mb-3 h-6 w-6" />
              System
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
