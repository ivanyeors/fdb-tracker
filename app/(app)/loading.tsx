import { PageSkeleton } from "@/components/loading"

export default function AppLoading() {
  return (
    <PageSkeleton metricCount={3} metricCountSecondary={4} showChart />
  )
}
