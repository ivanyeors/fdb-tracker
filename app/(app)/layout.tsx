import { redirect } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { AppMainChrome } from "@/components/layout/app-main-chrome"
import { TopNav } from "@/components/layout/top-nav"
import { ActiveProfileProvider } from "@/hooks/use-active-profile"
import { GlobalMonthProvider } from "@/hooks/use-global-month"
import { DataRefreshProvider } from "@/hooks/use-data-refresh"
import { cookies } from "next/headers"
import { getSessionDetails } from "@/lib/auth/session"
import { decodeFamilyName } from "@/lib/repos/families"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"

export default async function AppLayout({ children }: { readonly children: React.ReactNode }) {
  const cookieStore = await cookies()
  const session = await getSessionDetails(cookieStore)

  if (!session) {
    redirect("/login")
  }
  const accountId = session.accountId

  const supabase = createSupabaseAdmin()
  const { data: rawFamilies } = await supabase
    .from("families")
    .select("id, name, name_enc, user_count, created_at")
    .eq("household_id", accountId)
    .order("created_at", { ascending: true })

  const families = (rawFamilies ?? []).map((f) => ({
    id: f.id,
    name: decodeFamilyName(f) ?? f.name,
    user_count: f.user_count,
    created_at: f.created_at,
  }))

  const familyIds = families.map((f) => f.id)
  const { data: rawProfiles } =
    familyIds.length > 0
      ? await supabase
          .from("profiles")
          .select(
            "id, name, name_enc, birth_year, birth_year_enc, family_id, created_at",
          )
          .in("family_id", familyIds)
          .order("created_at", { ascending: true })
      : { data: [] }

  const profiles = (rawProfiles ?? []).map((p) => {
    const decoded = decodeProfilePii(p)
    return {
      id: p.id,
      name: decoded.name ?? "",
      birth_year: decoded.birth_year ?? 0,
      family_id: p.family_id,
    }
  })

  const cookieFamilyId = cookieStore.get("fdb-active-family-id")?.value ?? null
  const initialFamilyId =
    cookieFamilyId && familyIds.includes(cookieFamilyId)
      ? cookieFamilyId
      : (families ?? [])[0]?.id ?? null

  return (
    <ActiveProfileProvider
      families={families}
      profiles={profiles}
      initialFamilyId={initialFamilyId}
    >
      <GlobalMonthProvider>
        <DataRefreshProvider>
          <SidebarProvider>
            <TopNav />
            <SidebarNav isSuperAdmin={session.isSuperAdmin} />
            <SidebarInset className="min-h-0 pt-(--top-nav-height) transition-[padding-top] duration-200">
              <AppMainChrome>{children}</AppMainChrome>
            </SidebarInset>
          </SidebarProvider>
        </DataRefreshProvider>
      </GlobalMonthProvider>
    </ActiveProfileProvider>
  )
}
