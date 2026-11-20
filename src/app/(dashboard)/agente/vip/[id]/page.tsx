import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { loadBoQueue } from "@/lib/pc/bo-queue"
import { getVipClient, listVipChanges, vipClientPath } from "@/lib/vip"
import { pcSiteUrl } from "@/lib/site-url"
import { LOCALE_TAGS } from "@/i18n/config"
import { getBoI18n } from "@/i18n/bo-server"
import { getBoTimeZone } from "@/lib/bo-timezone-server"
import { ChannelQueue } from "@/components/channels/channel-queue"
import { QueueLive } from "@/components/channels/queue-live"
import { CopyField, EditVipClient, VipActiveToggle } from "@/components/vip/vip-forms"

/**
 * B2G-22 · a ficha de um VIP: o contacto, o link pessoal, desactivar ou
 * reactivar, e todos os pedidos dele — também os fechados, e também depois
 * de desactivado ("o histórico fica").
 */

export const dynamic = "force-dynamic"

export default async function VipDetailPage({ params }: { params: { id: string } }) {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const tenant = access.identity.tenant
  const scope = await getBoScope()
  const vip = await getVipClient(scope, params.id)
  if (!vip) notFound()
  const { t, locale } = await getBoI18n()

  const queue = await loadBoQueue(scope, { vipClientId: vip.id }, access.identity.userId)
  /* VIP-01 · o endereço novo: `/pc/<nome>-<código>`. O `/vip/<token>` já enviado redirecciona para ele. */
  const link = `${pcSiteUrl({ slug: tenant.partnerSlug, isOperator: tenant.isOperator })}${vipClientPath(vip)}`
  /* APP-04 · "cada alteração fica registada, com a data, e aparece ao agente na ficha do cliente". */
  const changes = await listVipChanges(scope, vip.id)
  /* E8 · as horas no fuso da conta de quem está a ver (`lib/bo-timezone`). */
  const timeZone = await getBoTimeZone()
  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeStyle: "short", timeZone })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/agente/vip" className="text-sm text-slate-500 hover:underline">
          ← {t("bo.vip.list.title")}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {vip.name}
              {!vip.active && (
                <span className="ml-3 align-middle rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold uppercase text-slate-600">
                  {t("bo.vip.list.inactive")}
                </span>
              )}
            </h1>
            <p className="text-slate-500 mt-1">{vip.level ?? t("bo.vip.detail.noLevel")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* E5 · o pedido novo aparece na ficha do cliente sem recarregar. */}
            <QueueLive label={t("bo.masterConcierge.live")} />
            <EditVipClient
              id={vip.id}
              initial={{ name: vip.name, phone: vip.phone ?? "", email: vip.email ?? "", level: vip.level ?? "" }}
            />
            <VipActiveToggle id={vip.id} active={vip.active} />
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-1 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("bo.vip.list.contacts")}</div>
          <div>{vip.email ?? "—"}</div>
          <div>{vip.phone ?? "—"}</div>
          <div className="text-xs text-slate-500 pt-2">
            {t("bo.vip.detail.createdBy", { who: vip.createdByEmail ?? "—", when: date.format(new Date(vip.createdAt)) })}
          </div>
          {vip.deactivatedAt && (
            <div className="text-xs text-slate-500">
              {t("bo.vip.detail.deactivatedBy", {
                who: vip.deactivatedByEmail ?? "—",
                when: date.format(new Date(vip.deactivatedAt)),
              })}
            </div>
          )}
        </div>
        <div>
          {vip.active ? (
            <CopyField label={t("bo.vip.list.link")} value={link} />
          ) : (
            <p className="text-sm text-slate-500">{t("bo.vip.detail.linkOff")}</p>
          )}
        </div>
      </section>

      {/* APP-04 · o que o cliente mudou em Meus dados, na app dele. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("bo.vip.changes.title")}</h2>
          <p className="text-sm text-slate-500">{t("bo.vip.changes.subtitle")}</p>
        </div>
        {changes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
            {t("bo.vip.changes.empty")}
          </p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("bo.vip.changes.when")}</th>
                  <th className="px-4 py-3 font-semibold">{t("bo.vip.changes.who")}</th>
                  <th className="px-4 py-3 font-semibold">{t("bo.vip.changes.what")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {changes.map((change) => (
                  <tr key={change.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {date.format(new Date(change.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="font-medium">
                        {change.actorKind === "staff"
                          ? (change.actorEmail ?? t("bo.vip.changes.byStaff"))
                          : t("bo.vip.changes.byClient")}
                      </div>
                      <div className="text-xs text-slate-500">{t(`bo.vip.changes.source.${change.source}`)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-1">
                        {change.fields.map((field) => (
                          <li key={field}>
                            <span className="font-medium text-slate-900">{t(`bo.vip.changes.field.${field}`)}</span>
                            <span className="text-slate-500">
                              {" · "}
                              {t("bo.vip.changes.from")}: {change.before[field] || t("bo.vip.changes.none")}
                              {" → "}
                              {t("bo.vip.changes.to")}: {change.after[field] || t("bo.vip.changes.none")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ChannelQueue
        rows={queue.rows}
        t={t}
        title={t("bo.vip.detail.requests")}
        empty={t("bo.vip.detail.noRequests")}
        viewerId={access.identity.userId}
      />
    </div>
  )
}
