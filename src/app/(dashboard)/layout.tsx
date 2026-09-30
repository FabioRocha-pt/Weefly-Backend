import { getCurrentUser } from "@/lib/current-user"
import {
  moduleState,
  requireApprovedAccount,
  visibleAgentMenus,
  PRO_MODULES,
} from "@/lib/pro-account"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import type { SidebarModule } from "@/components/dashboard/sidebar"
import { I18nProvider } from "@/i18n/provider"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * WeeFly Pro · a moldura dos módulos.
 *
 * PRO-09 · uma conta pendente ou recusada não passa daqui. Cada módulo tem
 * ainda o seu layout com `requireModule`, porque "aprovada" não quer dizer
 * "pode abrir o Admin".
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [account, user] = await Promise.all([requireApprovedAccount(), getCurrentUser()])

  const menuUser = user
    ? { fullName: user.fullName, email: user.email, initials: user.initials }
    : null

  const modules = PRO_MODULES.flatMap((id): SidebarModule[] => {
    const state = moduleState(account, id)
    return state === "hidden" ? [] : [{ id, state }]
  })

  /* I18N-01 · o WeeFly Pro é back-office: fala a língua que o utilizador
     escolheu nas Definições (PT ou EN), e não a do cookie do site público. */
  const i18n = await getBoI18n()

  return (
    <I18nProvider locale={i18n.locale} dictionary={i18n.dictionary} fallback={i18n.fallback}>
      <DashboardShell
        user={menuUser}
        modules={modules}
        agentMenus={visibleAgentMenus(account)}
        companyName={account.partner?.name ?? null}
        canManageTeam={account.profile?.manageUsers === "own_partner"}
      >
        {children}
      </DashboardShell>
    </I18nProvider>
  )
}
