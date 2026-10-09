import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { loadBoQueue } from "@/lib/pc/bo-queue"
import { getVipClient } from "@/lib/vip"
import { pcSiteUrl } from "@/lib/site-url"
import { LOCALE_TAGS } from "@/i18n/config"
import { getBoI18n } from "@/i18n/bo-server"
import { ChannelQueue } from "@/components/channels/channel-queue"
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
  const link = `${pcSiteUrl({ slug: tenant.partnerSlug, isOperator: tenant.isOperator })}/vip/${vip.token}`
  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeStyle: "short" })

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
          <div className="flex flex-wrap gap-2">
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
