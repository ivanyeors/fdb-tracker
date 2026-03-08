import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Header } from "@/components/layout/header"
import { ActiveProfileProvider } from "@/hooks/use-active-profile"
import type { Profile } from "@/hooks/use-active-profile"

const mockProfiles: Profile[] = [
  { id: "1", name: "John", birth_year: 1992 },
  { id: "2", name: "Mary", birth_year: 1994 },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveProfileProvider profiles={mockProfiles}>
      <SidebarProvider>
        <SidebarNav />
        <SidebarInset>
          <Header />
          <div className="flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ActiveProfileProvider>
  )
}
