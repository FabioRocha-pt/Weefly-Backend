import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { listAlertRecipients, loadOrganisation } from "@/lib/b2g"
import { getBoI18n } from "@/i18n/bo-server"
import { OrganisationDetailView } from "@/components/b2g/org-detail"

/** PAR-02 a PAR-05 · um ministério, no backoffice do parceiro. */
export default async function MinisterioPage({ params }: { params: { id: string } }) {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const tenant = access.identity.tenant

  /* TEN-03 · um ministério de outro parceiro, pelo endereço, não existe. */
  const detail = await loadOrganisation(params.id, { partnerId: tenant.partnerId })
  if (!detail) notFound()

  const { t, locale } = await getBoI18n()
  const recipients = await listAlertRecipients(tenant.partnerId)
  const canManage = Boolean(access.identity.profile && access.identity.profile.manageUsers !== "none")

  return (
    <OrganisationDetailView
      detail={detail}
      partner={{ id: tenant.partnerId, slug: tenant.partnerSlug, is_operator: tenant.isOperator, name: tenant.partnerName }}
      mode="partner"
      canManage={canManage}
      recipients={recipients}
      t={t}
      locale={locale}
    />
  )
}
