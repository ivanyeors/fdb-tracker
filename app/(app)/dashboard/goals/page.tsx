"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function GoalsPageRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/banks#savings-goals")
  }, [router])
  return null
}
