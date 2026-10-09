import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope, isCrossPartner } from "@/lib/bo-scope"
import { loadBoQueue } from "@/lib/pc/bo-queue"
import { CASE_CHANNEL_OF, PARTNER_CHANNELS, type CaseChannel } from "@/lib/channels"
import { getBoI18n } from "@/i18n/bo-server"
import { ChannelQueue } from "@/components/channels/channel-queue"
import { QueueLive } from "@/components/channels/queue-live"

/**
 * B2G-14 · D-12 · o concierge do master.
 *
 * "O master tem um sistema igual ao concierge das empresas, mas sem empresa:
 * vê e trata os pedidos de todas." A mesma fila (`loadBoQueue`), lida pela
 * sessão na área de trabalho "todas" (`getBoScope({ workspace: "all" })`, que
 * só uma conta `cross_partner` recebe) — o RLS mostra-lhe todas as empresas.
 *
 *   · filtro por empresa (`?empresa=`) e por canal (`?canal=`), no endereço;
 *   · cada linha diz de que empresa é;
 *   · B2G-11 · a urgência primeiro, e dentro dela quem espera há mais tempo;
 *   · B2G-13 · reclamar como qualquer agente (`claim_case`): a linha mostra
 *     "Seu" ou "Reclamado por …"; a ficha abre no Concierge, para qualquer
 *     empresa (decisão 2);
 *   · B2G-12 · os pedidos novos aparecem sem recarregar (`QueueLive`).
 *
 * Qualquer outra conta: 404 (o módulo Admin já é só do master; a página
 * volta a perguntar).
 */

export const dynamic = "force-dynamic"

type Show = "open" | "unclaimed" | "mine"
const SHOWS: Show[] = ["open", "unclaimed", "mine"]
/* Os três canais, pela ordem dos menus (Público, VIP, Ministérios). */
const CASE_CHANNELS: CaseChannel[] = PARTNER_CHANNELS.map((c) => CASE_CHANNEL_OF[c])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MasterConciergePage({
  searchParams,
}: {
  searchParams: { empresa?: string; canal?: string; ver?: string }
}) {
  const scope = await getBoScope({ workspace: "all" })
  if (!scope || !isCrossPartner(scope.identity) || scope.partnerId !== null) notFound()
  const { t } = await getBoI18n()

  const { data: partnerRows } = await scope.db
    .from("partners")
    .select("id, commercial_name, is_operator")
    .order("is_operator", { ascending: false })
    .order("commercial_name")
  const partners = (partnerRows ?? []) as { id: string; commercial_name: string }[]

  /* O filtro vem do endereço: só um id de uma empresa que a sessão vê, e só
     um dos três canais. Qualquer outra coisa é "todas". */
  const partnerId =
    searchParams.empresa && UUID.test(searchParams.empresa) && partners.some((p) => p.id === searchParams.empresa)
      ? searchParams.empresa
      : ""
  const channel = (CASE_CHANNELS as string[]).includes(searchParams.canal ?? "")
    ? (searchParams.canal as CaseChannel)
    : ""
  const show: Show = SHOWS.includes(searchParams.ver as Show) ? (searchParams.ver as Show) : "open"

  const queue = await loadBoQueue(
    scope,
    {
      bucket: "tudo",
      order: "urgency",
      ...(partnerId ? { partnerId } : {}),
      ...(channel ? { channel } : {}),
    },
    scope.identity.userId
  )
  const rows = queue.rows.filter((row) =>
    show === "unclaimed" ? !row.ownerId : show === "mine" ? row.ownerId === scope.identity.userId : true
  )

  const field =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"

  const href = (next: Partial<{ empresa: string; canal: string; ver: string }>) => {
    const params = new URLSearchParams()
    const e = next.empresa ?? partnerId
    const c = next.canal ?? channel
    const v = next.ver ?? show
    if (e) params.set("empresa", e)
    if (c) params.set("canal", c)
    if (v !== "open") params.set("ver", v)
    const qs = params.toString()
    return qs ? `/gestao/concierge?${qs}` : "/gestao/concierge"
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("bo.masterConcierge.title")}</h1>
          <p className="text-slate-500 mt-1">{t("bo.masterConcierge.subtitle")}</p>
        </div>
        <QueueLive workspace="all" label={t("bo.masterConcierge.live")} />
      </div>

      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {t("bo.masterConcierge.company")}
          <select name="empresa" defaultValue={partnerId} className={field}>
            <option value="">{t("bo.masterConcierge.allCompanies")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.commercial_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {t("bo.masterConcierge.channel")}
          <select name="canal" defaultValue={channel} className={field}>
            <option value="">{t("bo.masterConcierge.allChannels")}</option>
            {CASE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`bo.channels.${c}`)}
              </option>
            ))}
          </select>
        </label>
        {show !== "open" && <input type="hidden" name="ver" value={show} />}
        <button
          type="submit"
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          {t("bo.masterConcierge.filter")}
        </button>
      </form>

      <div className="flex flex-wrap gap-2" aria-label={t("bo.masterConcierge.show")}>
        {SHOWS.map((s) => (
          <Link
            key={s}
            href={href({ ver: s })}
            aria-pressed={s === show}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              s === show
                ? "border-orange-600 bg-orange-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t(`bo.masterConcierge.${s}`)}
          </Link>
        ))}
      </div>

      <ChannelQueue
        rows={rows}
        t={t}
        title={t("bo.masterConcierge.title")}
        empty={t("bo.masterConcierge.empty")}
        showWho
        showPartner
        viewerId={scope.identity.userId}
      />
    </div>
  )
}
