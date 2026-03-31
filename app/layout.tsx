import localFont from "next/font/local"

import "./globals.css"

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="fdb-chart-palette",c="fdb-chart-palette-colors",id=localStorage.getItem(k);if(!id||id==="green")return;var d=document.documentElement.classList.contains("dark");var p={"blue":{c:["oklch(0.897 0.196 240)","oklch(0.768 0.233 240)","oklch(0.648 0.2 240)","oklch(0.532 0.157 240)","oklch(0.453 0.124 240)"],p:"oklch(0.650 0.190 173.5)",n:"oklch(0.580 0.220 341.5)",u:"oklch(0.550 0.020 240.0)",pd:"oklch(0.720 0.170 173.5)",nd:"oklch(0.700 0.190 341.5)",ud:"oklch(0.650 0.020 240.0)"},"sunset":{c:["oklch(0.897 0.196 35)","oklch(0.768 0.22 35)","oklch(0.648 0.2 35)","oklch(0.532 0.157 35)","oklch(0.453 0.124 35)"],p:"oklch(0.650 0.190 112.0)",n:"oklch(0.580 0.220 28.0)",u:"oklch(0.550 0.020 35.0)",pd:"oklch(0.720 0.170 112.0)",nd:"oklch(0.700 0.190 28.0)",ud:"oklch(0.650 0.020 35.0)"},"purple":{c:["oklch(0.897 0.196 300)","oklch(0.768 0.22 300)","oklch(0.648 0.2 300)","oklch(0.532 0.157 300)","oklch(0.453 0.124 300)"],p:"oklch(0.650 0.190 191.5)",n:"oklch(0.580 0.220 359.5)",u:"oklch(0.550 0.020 300.0)",pd:"oklch(0.720 0.170 191.5)",nd:"oklch(0.700 0.190 359.5)",ud:"oklch(0.650 0.020 300.0)"},"earth":{c:["oklch(0.897 0.14 75)","oklch(0.768 0.14 75)","oklch(0.648 0.14 75)","oklch(0.532 0.14 75)","oklch(0.453 0.124 75)"],p:"oklch(0.650 0.190 124.0)",n:"oklch(0.580 0.220 40.0)",u:"oklch(0.550 0.020 75.0)",pd:"oklch(0.720 0.170 124.0)",nd:"oklch(0.700 0.190 40.0)",ud:"oklch(0.650 0.020 75.0)"},"rainbow":{c:["oklch(0.65 0.22 30)","oklch(0.65 0.22 102)","oklch(0.65 0.22 174)","oklch(0.65 0.22 246)","oklch(0.65 0.22 318)"],p:"oklch(0.650 0.190 153.7)",n:"oklch(0.580 0.220 69.7)",u:"oklch(0.550 0.020 174.0)",pd:"oklch(0.720 0.170 153.7)",nd:"oklch(0.700 0.190 69.7)",ud:"oklch(0.650 0.020 174.0)"},"muted":{c:["oklch(0.6 0.12 250)","oklch(0.6 0.12 35)","oklch(0.6 0.12 160)","oklch(0.6 0.12 310)","oklch(0.6 0.12 90)"],p:"oklch(0.650 0.190 152.5)",n:"oklch(0.580 0.220 68.5)",u:"oklch(0.550 0.020 170.0)",pd:"oklch(0.720 0.170 152.5)",nd:"oklch(0.700 0.190 68.5)",ud:"oklch(0.650 0.020 170.0)"}};var v=p[id];if(!v){var r=localStorage.getItem(c);if(r){var j=JSON.parse(r);v={c:j.colors,p:j.positive,n:j.negative,u:j.neutral,pd:j.positiveDark,nd:j.negativeDark,ud:j.neutralDark}}}if(v){var s=document.documentElement.style;for(var i=0;i<5;i++)s.setProperty("--chart-"+(i+1),v.c[i]);s.setProperty("--chart-positive",d?v.pd:v.p);s.setProperty("--chart-negative",d?v.nd:v.n);s.setProperty("--chart-neutral",d?v.ud:v.u)}}catch(e){}})()`,
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
