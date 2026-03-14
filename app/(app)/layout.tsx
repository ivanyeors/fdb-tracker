import { redirect } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Header } from "@/components/layout/header"
import { ActiveProfileProvider } from "@/hooks/use-active-profile"
import { cookies } from "next/headers"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const accountId = await getSessionFromCookies(cookieStore)

  if (!accountId) {
    redirect("/login")
  }

  const supabase = createSupabaseAdmin()
  const { data: families } = await supabase
    .from("families")
    .select("id, name, user_count, created_at")
    .eq("household_id", accountId)
    .order("created_at", { ascending: true })

  const familyIds = (families ?? []).map((f) => f.id)
  const { data: profiles } =
    familyIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, name, birth_year, family_id")
          .in("family_id", familyIds)
          .order("created_at", { ascending: true })
      : { data: [] }

  const initialFamilyId = cookieStore.get("fdb-active-family-id")?.value ?? null

  return (
    <ActiveProfileProvider
      families={families ?? []}
      profiles={profiles ?? []}
      initialFamilyId={initialFamilyId && familyIds.includes(initialFamilyId) ? initialFamilyId : null}
    >
      <SidebarProvider>
        <SidebarNav />
        <SidebarInset>
          <Header />
          <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ActiveProfileProvider>
  )
}
