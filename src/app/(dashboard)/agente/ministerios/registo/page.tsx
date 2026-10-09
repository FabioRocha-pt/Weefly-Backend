import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { listOrganisations } from "@/lib/b2g"
import { listActivity, listActivitySecretaries } from "@/lib/b2g-activity"
import { getBoI18n } from "@/i18n/bo-server"
import { ActivityLog } from "@/components/b2g/activity-log"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const uuidOrUndef = (v?: string) => (v && UUID.test(v) ? v : undefined)
const dayOrUndef = (v?: string) => (v && ISO_DAY.test(v) ? v : undefined)

/**
 * B2G-19 · o registo de todos os ministérios do parceiro, com filtros por
 * ministério, secretária e período, e exportação CSV.
 */
export default async function AgenteMinisteriosRegistoPage({
  searchParams,
}: {
  searchParams: { ministerio?: string; secretaria?: string; de?: string; ate?: string }
}) {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const partnerId = access.identity.tenant.partnerId
  const scope = await getBoScope()
  if (!scope) notFound()

  const { t, locale } = await getBoI18n()

  const filters = {
    organisationId: uuidOrUndef(searchParams.ministerio),
    secretaryId: uuidOrUndef(searchParams.secretaria),
    from: dayOrUndef(searchParams.de),
    to: dayOrUndef(searchParams.ate),
  }

  const [orgs, secretaries, rows] = await Promise.all([
    listOrganisations(scope, partnerId),
    listActivitySecretaries(scope, { partnerId }),
    listActivity(scope, { partnerId, ...filters }),
  ])

  const exportParams = new URLSearchParams({ scope: "partner" })
  if (filters.organisationId) exportParams.set("ministerio", filters.organisationId)
  if (filters.secretaryId) exportParams.set("secretaria", filters.secretaryId)
  if (filters.from) exportParams.set("de", filters.from)
  if (filters.to) exportParams.set("ate", filters.to)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.activity.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.activity.subtitleAll")}</p>
      </div>
      <ActivityLog
        rows={rows}
        t={t}
        locale={locale}
        basePath="/agente/ministerios/registo"
        filters={filters}
        organisations={orgs.map((o) => ({ id: o.id, name: o.name }))}
        secretaries={secretaries}
        exportHref={`/api/b2g/activity/export?${exportParams.toString()}`}
      />
    </div>
  )
}
