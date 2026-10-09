import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { listAlertRecipients, loadOrganisation } from "@/lib/b2g"
import { listTravellers } from "@/lib/travellers"
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

  /* DAT-01 · as fichas dos viajantes do ministério. */
  const scopeForList = await getBoScope()
  const travellers = scopeForList ? await listTravellers(scopeForList, detail.org.id) : []

  return (
    <OrganisationDetailView
      detail={detail}
      partner={{ id: tenant.partnerId, slug: tenant.partnerSlug, is_operator: tenant.isOperator, name: tenant.partnerName }}
      mode="partner"
      canManage={canManage}
      recipients={recipients}
      travellers={travellers}
      viewer={{
        email: access.identity.email,
        isManager: canManage,
        crossPartner: Boolean(access.identity.profile?.crossPartner),
        backoffice: Boolean(access.identity.profile?.backoffice),
      }}
      t={t}
      locale={locale}
    />
  )
}
