import { notFound } from "next/navigation"

import { getBoAccess } from "@/lib/bo-access"
import { getBoScope } from "@/lib/bo-scope"
import { loadBoQueue } from "@/lib/pc/bo-queue"
import { ChannelQueue } from "@/components/channels/channel-queue"
import { listOrganisationRequests, listOrganisations } from "@/lib/b2g"
import { getBoI18n } from "@/i18n/bo-server"
import { OrganisationList } from "@/components/b2g/org-list"
import { NewOrganisation } from "@/components/b2g/b2g-forms"
import { OwnRequestList, RequestMinistryForm } from "@/components/b2g/ministry-requests"

/**
 * PAR-02 · os ministérios do parceiro.
 *
 * B2G-23 · D-10 · a empresa não cria ministérios: **pede-os** ao master
 * (nome, logótipo horizontal e brasão), e vê aqui o estado de cada pedido —
 * é o aviso da decisão, além do email. A WeeFly (master) continua a poder
 * criar directamente.
 *
 * B2G-21 · o terceiro menu do terminal de vendas, com a fila dos pedidos que
 * vieram dos ministérios (`booking_cases.channel = 'ministerio'`).
 */
export default async function MinisteriosPage() {
  const access = await getBoAccess()
  if (!access.ok || !access.identity.tenant) notFound()
  const { t, locale } = await getBoI18n()
  const scope = await getBoScope()
  const [orgs, queue, requests] = await Promise.all([
    listOrganisations(scope),
    loadBoQueue(scope, { bucket: "tudo", channel: "ministerio" }, access.identity.userId),
    scope ? listOrganisationRequests(scope, { partnerId: access.identity.tenant.partnerId }) : Promise.resolve([]),
  ])
  const crossPartner = Boolean(access.identity.profile?.crossPartner)
  /* Decisão 5 · pedir um ministério: qualquer conta do back-office da empresa. */
  const canRequest = Boolean(access.identity.profile?.backoffice)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("bo.b2g.list.title")}</h1>
          <p className="text-slate-500 mt-1">{t("bo.b2g.list.subtitle")}</p>
        </div>
        {crossPartner ? <NewOrganisation /> : canRequest && <RequestMinistryForm />}
      </div>
      <OrganisationList orgs={orgs} hrefFor={(id) => `/agente/ministerios/${id}`} t={t} locale={locale} />
      <OwnRequestList requests={requests.filter((r) => r.status !== "approved" || Date.now() - new Date(r.decidedAt ?? r.createdAt).getTime() < 30 * 86400000)} />
      <ChannelQueue
        rows={queue.rows}
        t={t}
        title={t("bo.channelQueue.ministerio")}
        empty={t("bo.channelQueue.empty")}
        showWho
      />
    </div>
  )
}
