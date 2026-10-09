import { notFound } from "next/navigation"

import { getBoScope, isCrossPartner } from "@/lib/bo-scope"
import { listActivity, listActivitySecretaries } from "@/lib/b2g-activity"
import { getBoI18n } from "@/i18n/bo-server"
import { ActivityLog } from "@/components/b2g/activity-log"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const uuidOrUndef = (v?: string) => (v && UUID.test(v) ? v : undefined)
const dayOrUndef = (v?: string) => (v && ISO_DAY.test(v) ? v : undefined)

/**
 * B2G-19 · o registo de todas as empresas, no Admin — o mesmo registo que
 * cada empresa vê da sua, por `b2g_activity` (o RLS deixa o master ver tudo).
 */
export default async function B2gRegistoPage({
  searchParams,
}: {
  searchParams: { empresa?: string; ministerio?: string; secretaria?: string; de?: string; ate?: string }
}) {
  const scope = await getBoScope({ workspace: "all" })
  if (!scope || !isCrossPartner(scope.identity) || scope.partnerId !== null) notFound()
  const { t, locale } = await getBoI18n()

  const { data: partnerRows } = await scope.db
    .from("partners")
    .select("id, commercial_name")
    .contains("channels", ["B2G"])
    .order("commercial_name")
  const partners = (partnerRows ?? []) as { id: string; commercial_name: string }[]

  const partnerId = partners.some((p) => p.id === searchParams.empresa) ? searchParams.empresa : undefined

  let orgQuery = scope.db.from("organisations").select("id, name, partner_id").order("name")
  if (partnerId) orgQuery = orgQuery.eq("partner_id", partnerId)
  const { data: orgRows } = await orgQuery
  const orgs = (orgRows ?? []) as { id: string; name: string; partner_id: string }[]

  const filters = {
    partnerId,
    organisationId: orgs.some((o) => o.id === searchParams.ministerio) ? uuidOrUndef(searchParams.ministerio) : undefined,
    secretaryId: uuidOrUndef(searchParams.secretaria),
    from: dayOrUndef(searchParams.de),
    to: dayOrUndef(searchParams.ate),
  }

  const [secretaries, rows] = await Promise.all([
    listActivitySecretaries(scope, { partnerId, organisationId: filters.organisationId }),
    listActivity(scope, filters),
  ])

  const exportParams = new URLSearchParams({ scope: "admin" })
  if (filters.partnerId) exportParams.set("empresa", filters.partnerId)
  if (filters.organisationId) exportParams.set("ministerio", filters.organisationId)
  if (filters.secretaryId) exportParams.set("secretaria", filters.secretaryId)
  if (filters.from) exportParams.set("de", filters.from)
  if (filters.to) exportParams.set("ate", filters.to)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.activity.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.activity.subtitleAdmin")}</p>
      </div>
      <ActivityLog
        rows={rows}
        t={t}
        locale={locale}
        basePath="/gestao/b2g/registo"
        filters={filters}
        organisations={orgs.map((o) => ({ id: o.id, name: o.name }))}
        secretaries={secretaries}
        partners={partners}
        exportHref={`/api/b2g/activity/export?${exportParams.toString()}`}
      />
    </div>
  )
}
