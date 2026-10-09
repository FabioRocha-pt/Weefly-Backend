import { getCurrentUser } from "@/lib/current-user"
import { assertHostAllowsAccount } from "@/lib/host-partner"
import {
  moduleState,
  requireApprovedAccount,
  visibleAgentMenus,
  PRO_MODULES,
} from "@/lib/pro-account"
import { hasChannel } from "@/lib/channels"
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
  /* DOM-01 · por `<outra>.weefly.africa`, 404. */
  assertHostAllowsAccount(account)

  const menuUser = user
    ? { fullName: user.fullName, email: user.email, initials: user.initials }
    : null

  /* B2G-01 · o master trabalha sem empresa (D-12): numa conta que vê todos os
     parceiros, o menu não mostra o nome nem o logótipo de nenhuma. */
  const master = Boolean(account.profile?.crossPartner)

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
        companyName={master ? null : account.partner?.name ?? null}
        companyLogoUrl={!master && account.partner && !account.partner.isOperator ? account.partner.logoUrl : null}
        canManageTeam={account.profile?.manageUsers === "own_partner"}
        sellsB2g={hasChannel(account.partner?.channels, "B2G")}
        poweredByWeefly={Boolean(account.partner && !account.partner.isOperator && account.partner.poweredByWeefly)}
      >
        {children}
      </DashboardShell>
    </I18nProvider>
  )
}
