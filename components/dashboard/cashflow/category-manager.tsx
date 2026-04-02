"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Settings2 } from "lucide-react"

export function CategoryManagerButton() {
  const router = useRouter()

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => router.push("/dashboard/cashflow/categories")}
    >
      <Settings2 className="mr-2 h-4 w-4" />
      Manage Categories
    </Button>
  )
}
