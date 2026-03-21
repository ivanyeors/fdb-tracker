# Scaffold a New Dashboard Page

Use this guide when creating a new page under the dashboard section.

## Steps

1. **Create the page file** at `app/(app)/dashboard/<name>/page.tsx`
2. **Follow the standard pattern** below
3. **Create API route(s)** if needed — see `/new-api-route`
4. **Add navigation** — update the sidebar in `components/layout/` to include the new page link

## Page Template

```tsx
"use client"

import { useActiveProfile } from "@/hooks/use-active-profile"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { toast } from "sonner"

export default function NewPage() {
  const { activeProfileId, activeFamilyId, profiles } = useActiveProfile()
  const [data, setData] = useState<YourDataType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (activeProfileId) params.set("profileId", activeProfileId)
        if (activeFamilyId) params.set("familyId", activeFamilyId)

        const res = await fetch(`/api/your-endpoint?${params}`)
        if (!res.ok) throw new Error("Failed to fetch")
        setData(await res.json())
      } catch {
        toast.error("Failed to load data")
      } finally {
        setLoading(false)
      }
    }
    if (activeFamilyId) fetchData()
  }, [activeProfileId, activeFamilyId])

  return (
    <div className="space-y-6">
      <SectionHeader title="Page Title" />

      <Tabs defaultValue="combined">
        <TabsList>
          <TabsTrigger value="combined">Combined</TabsTrigger>
          {profiles.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="combined">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Metric" value={data?.metric ?? 0} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

## Checklist

- [ ] Page file created under `app/(app)/dashboard/<name>/page.tsx`
- [ ] Uses `"use client"` directive
- [ ] Fetches data via `useEffect` with `activeProfileId`/`activeFamilyId` dependencies
- [ ] Shows loading skeletons while data loads
- [ ] Uses `toast.error()` for fetch failures
- [ ] Supports Combined and per-profile tabs
- [ ] Uses `MetricCard` and `SectionHeader` where appropriate
- [ ] Sidebar navigation updated
