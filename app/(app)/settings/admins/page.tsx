import { notFound } from "next/navigation"
import { getSuperAdminSession } from "@/lib/auth/admin"
import { AdminLookup } from "./admin-lookup"

export default async function AdminsPage() {
  const session = await getSuperAdminSession()
  if (!session) notFound()

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-2 sm:p-4">
      <div>
        <h1 className="text-2xl font-semibold">Platform admins</h1>
        <p className="text-muted-foreground mt-1">
          Look up an account by household UUID to inspect or change its
          super-admin status.
        </p>
      </div>

      <AdminLookup currentAccountId={session.accountId} />
    </div>
  )
}
