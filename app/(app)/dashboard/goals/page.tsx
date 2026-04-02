import { redirect } from "next/navigation"

export default function GoalsPageRedirect() {
  redirect("/dashboard/banks#savings-goals")
}
