import { PageSkeleton } from "@/components/loading"

export default function TaxLoading() {
  return <PageSkeleton metricCount={3} showChart chartHeight={300} />
}
