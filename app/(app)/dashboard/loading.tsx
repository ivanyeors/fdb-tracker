import { PageSkeleton } from "@/components/loading"

export default function DashboardLoading() {
  return (
    <PageSkeleton
      metricCount={3}
      metricCountSecondary={4}
      showChart
      chartHeight={300}
    />
  )
}
