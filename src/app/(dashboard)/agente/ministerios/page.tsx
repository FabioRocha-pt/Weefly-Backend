import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { listOrganisations } from "@/lib/b2g"
import { getBoI18n } from "@/i18n/bo-server"
import { OrganisationList } from "@/components/b2g/org-list"
import { NewOrganisation } from "@/components/b2g/b2g-forms"

/**
 * PAR-02 · os ministérios do parceiro. "A Alô cria e gere os ministérios sem
 * precisar da WeeFly."
 *
 * Menu próprio (Ministérios), à espera da decisão O3: se ficar dentro de
 * Cliente, muda só a entrada do menu lateral.
 */
export default async function MinisteriosPage() {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const { t, locale } = await getBoI18n()
  const orgs = await listOrganisations()
  const canManage = Boolean(access.identity.profile && access.identity.profile.manageUsers !== "none")

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("bo.b2g.list.title")}</h1>
          <p className="text-slate-500 mt-1">{t("bo.b2g.list.subtitle")}</p>
        </div>
        {canManage && <NewOrganisation />}
      </div>
      <OrganisationList orgs={orgs} hrefFor={(id) => `/agente/ministerios/${id}`} t={t} locale={locale} />
    </div>
  )
}
