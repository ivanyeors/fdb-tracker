import { PageSkeleton } from "@/components/loading"

export default function InvestmentsLoading() {
  return (
    <PageSkeleton metricCount={4} showChart chartHeight={300} showTable />
  )
}
