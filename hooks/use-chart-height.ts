import { useIsMobile } from "@/hooks/use-mobile"

export function useChartHeight(desktop: number, mobile: number): number {
  const isMobile = useIsMobile()
  return isMobile ? mobile : desktop
}
