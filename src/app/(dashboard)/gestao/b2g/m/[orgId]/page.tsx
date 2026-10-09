import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { listAlertRecipients, loadOrganisation } from "@/lib/b2g"
import { listTravellerChanges, listTravellers } from "@/lib/travellers"
import { TravellerChangeLog } from "@/components/b2g/traveller-change-log"
import { getBoI18n } from "@/i18n/bo-server"
import { OrganisationDetailView } from "@/components/b2g/org-detail"

/** ADM-08 · um ministério, visto pelo Admin WeeFly: só leitura, e corrigir o saldo. */
export default async function B2gOrganisationPage({ params }: { params: { orgId: string } }) {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()

  const detail = await loadOrganisation(params.orgId, { partnerId: null })
  if (!detail) notFound()

  const { data: partner } = await scope.db
    .from("partners")
    .select("id, slug, is_operator, commercial_name")
    .eq("id", detail.org.partnerId)
    .maybeSingle()
  if (!partner) notFound()
  const p = partner as { id: string; slug: string; is_operator: boolean; commercial_name: string }

  const { t, locale } = await getBoI18n()
  const recipients = await listAlertRecipients(p.id)

  /* DAT-01 · as fichas dos viajantes do ministério. */
  const scopeForList = scope
  const travellers = scopeForList ? await listTravellers(scopeForList, detail.org.id) : []
  /* B2G-25 · D-11 · cada registo e cada alteração das fichas, com quem e quando. */
  const changes = await listTravellerChanges(scope, detail.org.id)

  return (
    <div className="space-y-4">
      <div className="max-w-6xl mx-auto">
        <Link href={`/gestao/b2g/${p.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {p.commercial_name}
        </Link>
      </div>
      <OrganisationDetailView
        detail={detail}
        partner={{ id: p.id, slug: p.slug, is_operator: p.is_operator, name: p.commercial_name }}
        mode="admin"
        canManage
        recipients={recipients}
        travellers={travellers}
        viewer={{
          email: scope.identity.email,
          isManager: true,
          crossPartner: true,
          backoffice: true,
        }}
        t={t}
        locale={locale}
      />
      <TravellerChangeLog changes={changes} t={t} locale={locale} />
    </div>
  )
}
