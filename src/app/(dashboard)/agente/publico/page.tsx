import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { loadBoQueue } from "@/lib/pc/bo-queue"
import { pcSiteUrl } from "@/lib/site-url"
import { getBoI18n } from "@/i18n/bo-server"
import { ChannelQueue } from "@/components/channels/channel-queue"
import { CopyField } from "@/components/vip/vip-forms"

/**
 * B2G-21 · o menu Público: o link público do price checker da empresa, e os
 * pedidos que vieram por ele (`booking_cases.channel = 'publico'`).
 */

export const dynamic = "force-dynamic"

/** O mesmo slug que o construtor de links tira do email (`topbar-actions`). */
function agentSlug(email: string): string {
  return (email.split("@")[0] ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export default async function PublicoPage() {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const tenant = access.identity.tenant
  const { t } = await getBoI18n()

  const base = pcSiteUrl({ slug: tenant.partnerSlug, isOperator: tenant.isOperator })
  const bare = `${base}/pc`
  const params = new URLSearchParams({ agent: agentSlug(access.identity.email) })
  if (!tenant.isOperator) params.set("company", tenant.partnerSlug)
  const personal = `${bare}?${params.toString()}`

  const queue = await loadBoQueue(await getBoScope(), { bucket: "tudo", channel: "publico" }, access.identity.userId)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.publico.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.publico.subtitle")}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <CopyField label={t("bo.publico.bareLink")} value={bare} />
        <CopyField label={t("bo.publico.personalLink")} value={personal} />
        <p className="text-xs text-slate-500">{t("bo.publico.linkNote")}</p>
      </section>

      <ChannelQueue
        rows={queue.rows}
        t={t}
        title={t("bo.publico.queue")}
        empty={t("bo.channelQueue.empty")}
      />
    </div>
  )
}
