import localFont from "next/font/local"

import "./globals.css"

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
}
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const dmSans = localFont({
  src: [
    {
      path: "../public/fonts/DM_Sans/DMSans-VariableFont_opsz,wght.ttf",
      style: "normal",
    },
    {
      path: "../public/fonts/DM_Sans/DMSans-Italic-VariableFont_opsz,wght.ttf",
      style: "italic",
    },
  ],
  variable: "--font-sans",
})

const fontMono = localFont({
  src: "../public/fonts/Geist_Mono/GeistMono-VariableFont_wght.ttf",
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", dmSans.variable)}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="fdb-chart-palette",c="fdb-chart-palette-colors",id=localStorage.getItem(k);if(!id||id==="green")return;var p={"blue":["oklch(0.897 0.196 240)","oklch(0.768 0.233 240)","oklch(0.648 0.2 240)","oklch(0.532 0.157 240)","oklch(0.453 0.124 240)"],"sunset":["oklch(0.897 0.196 35)","oklch(0.768 0.22 35)","oklch(0.648 0.2 35)","oklch(0.532 0.157 35)","oklch(0.453 0.124 35)"],"purple":["oklch(0.897 0.196 300)","oklch(0.768 0.22 300)","oklch(0.648 0.2 300)","oklch(0.532 0.157 300)","oklch(0.453 0.124 300)"],"earth":["oklch(0.897 0.14 75)","oklch(0.768 0.14 75)","oklch(0.648 0.14 75)","oklch(0.532 0.14 75)","oklch(0.453 0.124 75)"],"rainbow":["oklch(0.65 0.22 30)","oklch(0.65 0.22 102)","oklch(0.65 0.22 174)","oklch(0.65 0.22 246)","oklch(0.65 0.22 318)"],"muted":["oklch(0.6 0.12 250)","oklch(0.6 0.12 35)","oklch(0.6 0.12 160)","oklch(0.6 0.12 310)","oklch(0.6 0.12 90)"]};var v=p[id];if(!v){var r=localStorage.getItem(c);if(r)v=JSON.parse(r)}if(v){var s=document.documentElement.style;s.setProperty("--chart-1",v[0]);s.setProperty("--chart-2",v[1]);s.setProperty("--chart-3",v[2]);s.setProperty("--chart-4",v[3]);s.setProperty("--chart-5",v[4])}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
