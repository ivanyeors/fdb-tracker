import { PageSkeleton } from "@/components/loading"

export default function CashflowLoading() {
  return <PageSkeleton metricCount={3} showChart chartHeight={400} />
}
