import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { loadBoQueue } from "@/lib/pc/bo-queue"
import { listVipClients } from "@/lib/vip"
import { pcSiteUrl } from "@/lib/site-url"
import { LOCALE_TAGS } from "@/i18n/config"
import { getBoI18n } from "@/i18n/bo-server"
import { ChannelQueue } from "@/components/channels/channel-queue"
import { CopyField, NewVipClient, VipActiveToggle } from "@/components/vip/vip-forms"

/**
 * B2G-21 · B2G-22 · o menu VIP: os clientes VIP da empresa, criar mais
 * (qualquer agente — decisão 5), o link pessoal de cada um, desactivar e
 * reactivar, e a fila dos pedidos VIP (`booking_cases.channel = 'vip'`).
 */

export const dynamic = "force-dynamic"

export default async function VipPage() {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const tenant = access.identity.tenant
  const { t, locale } = await getBoI18n()
  const scope = await getBoScope()

  const [vips, queue] = await Promise.all([
    listVipClients(scope),
    loadBoQueue(scope, { bucket: "tudo", channel: "vip" }, access.identity.userId),
  ])
  const base = pcSiteUrl({ slug: tenant.partnerSlug, isOperator: tenant.isOperator })
  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium" })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("bo.vip.list.title")}</h1>
          <p className="text-slate-500 mt-1">{t("bo.vip.list.subtitle")}</p>
        </div>
        <NewVipClient />
      </div>

      {vips.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
          {t("bo.vip.list.empty")}
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("bo.vip.list.client")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.vip.list.contacts")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.vip.list.link")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.vip.list.since")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vips.map((v) => (
                <tr key={v.id} className={v.active ? "align-top" : "align-top bg-slate-50/60 text-slate-400"}>
                  <td className="px-4 py-3">
                    <Link href={`/agente/vip/${v.id}`} className="font-semibold text-slate-900 hover:underline">
                      {v.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {v.level ?? "—"}
                      {!v.active && <span className="ml-2 font-semibold uppercase">{t("bo.vip.list.inactive")}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {v.email && <div className="truncate max-w-[16rem]">{v.email}</div>}
                    {v.phone && <div className="text-slate-500">{v.phone}</div>}
                  </td>
                  <td className="px-4 py-3 min-w-[18rem]">
                    {v.active ? (
                      <CopyField value={`${base}/vip/${v.token}`} />
                    ) : (
                      <span className="text-xs">{t("bo.vip.list.linkOff")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{date.format(new Date(v.createdAt))}</td>
                  <td className="px-4 py-3 text-right">
                    <VipActiveToggle id={v.id} active={v.active} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ChannelQueue
        rows={queue.rows}
        t={t}
        title={t("bo.vip.list.queue")}
        empty={t("bo.channelQueue.empty")}
        showWho
        viewerId={access.identity.userId}
      />
    </div>
  )
}
