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
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, birth_year")
    .eq("household_id", accountId)
    .order("created_at", { ascending: true })

  return (
    <ActiveProfileProvider profiles={profiles ?? []}>
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
