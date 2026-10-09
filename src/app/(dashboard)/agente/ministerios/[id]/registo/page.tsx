import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { loadOrganisation } from "@/lib/b2g"
import { listActivity, listActivitySecretaries } from "@/lib/b2g-activity"
import { getBoI18n } from "@/i18n/bo-server"
import { ActivityLog } from "@/components/b2g/activity-log"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const dayOrUndef = (v?: string) => (v && ISO_DAY.test(v) ? v : undefined)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuidOrUndef = (v?: string) => (v && UUID.test(v) ? v : undefined)

/** B2G-19 · o registo de um ministério, no backoffice do parceiro. */
export default async function MinisterioRegistoPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { secretaria?: string; de?: string; ate?: string }
}) {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const tenant = access.identity.tenant

  /* TEN-03 · um ministério de outro parceiro, pelo endereço, não existe. */
  const detail = await loadOrganisation(params.id, { partnerId: tenant.partnerId })
  if (!detail) notFound()

  const scope = await getBoScope()
  if (!scope) notFound()
  const { t, locale } = await getBoI18n()

  const filters = {
    organisationId: detail.org.id,
    secretaryId: uuidOrUndef(searchParams.secretaria),
    from: dayOrUndef(searchParams.de),
    to: dayOrUndef(searchParams.ate),
  }

  const [secretaries, rows] = await Promise.all([
    listActivitySecretaries(scope, { organisationId: detail.org.id }),
    listActivity(scope, { partnerId: tenant.partnerId, ...filters }),
  ])

  const exportParams = new URLSearchParams({ scope: "partner", ministerio: detail.org.id })
  if (filters.secretaryId) exportParams.set("secretaria", filters.secretaryId)
  if (filters.from) exportParams.set("de", filters.from)
  if (filters.to) exportParams.set("ate", filters.to)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href={`/agente/ministerios/${detail.org.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {detail.org.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{t("bo.activity.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.activity.subtitleOne", { name: detail.org.name })}</p>
      </div>
      <ActivityLog
        rows={rows}
        t={t}
        locale={locale}
        basePath={`/agente/ministerios/${detail.org.id}/registo`}
        filters={filters}
        secretaries={secretaries}
        exportHref={`/api/b2g/activity/export?${exportParams.toString()}`}
      />
    </div>
  )
}
