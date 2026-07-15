import { getCurrentUser } from "@/lib/current-user"
import { getCompanies } from "@/lib/companies"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, companies] = await Promise.all([getCurrentUser(), getCompanies()])

  const menuUser = user
    ? { fullName: user.fullName, email: user.email, initials: user.initials }
    : null

  const sidebarCompanies = companies.map((c) => ({
    id: c.id,
    commercialName: c.commercialName,
    type: c.type,
  }))

  return (
    <DashboardShell user={menuUser} companies={sidebarCompanies}>
      {children}
    </DashboardShell>
  )
}
