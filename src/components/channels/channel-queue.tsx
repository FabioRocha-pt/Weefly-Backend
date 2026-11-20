import Link from "next/link"

import type { BoQueueRow } from "@/lib/pc/bo-queue"
import { WAIT_FILTER_CSS, waitSince } from "@/lib/queue-wait"
import { formatMoney } from "@/lib/proposal-math"
import type { Translator } from "@/i18n/translate"
import { ClaimButton } from "@/components/channels/claim-button"
import { VipTag, vipClientHref } from "@/components/channels/vip-tag"
import { WaitBadge, WaitFilter, WaitRow } from "@/components/channels/wait"

/* B2G-11 · a etiqueta da urgência (só quando não é Normal). */
const URGENCY_CLASS: Record<1 | 2, string> = {
  1: "bg-amber-100 text-amber-800",
  2: "bg-red-100 text-red-700",
}

/**
 * B2G-21 · "Cada menu tem a sua fila de pedidos." A fila de um canal (ou de
 * um VIP, ou de um ministério) dentro do terminal de vendas, com a mesma
 * leitura que a fila do Concierge (`loadBoQueue`). Cada linha abre a ficha
 * do caso no Concierge, onde se trata.
 *
 * FILA-01 · um pedido de um cliente VIP leva a etiqueta VIP, com o nome dele,
 * que abre a ficha dele. Não muda de lugar na fila.
 *
 * FILA-02 · cada linha tem a cor do tempo de espera (`lib/queue-wait`), com o
 * tempo escrito ao lado, a mudar sozinha; e os críticos filtram-se. As cores
 * juntam-se à ordem que a fila já tem (nos Ministérios, a da urgência): não a
 * mudam.
 */
export function ChannelQueue({
  rows,
  t,
  title,
  empty,
  showWho = false,
  showPartner = false,
  viewerId,
  id = "channel-queue",
}: {
  rows: BoQueueRow[]
  t: Translator
  title: string
  empty: string
  /** Mostra o VIP ou o ministério de cada pedido (na fila do canal inteiro). */
  showWho?: boolean
  /** B2G-14 · a empresa de cada pedido (a fila do master). */
  showPartner?: boolean
  /**
   * B2G-13 · com a conta de quem olha, a fila mostra o dono de cada pedido
   * ("Seu", "Reclamado por …") e o botão de reclamar nos que não têm.
   */
  viewerId?: string
  /** O id do contentor, para o filtro dos críticos (um por página chega). */
  id?: string
}) {
  /* FILA-02 · desde quando cada linha espera; nulo = já não espera por nada. */
  const sinces = rows.map((row) => waitSince(row))
  return (
    <section className="space-y-3" id={id}>
      <style>{WAIT_FILTER_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {/* FILA-02 · "os críticos podem ser filtrados". */}
          {rows.length > 0 && <WaitFilter scope={id} sinces={sinces} />}
          <span className="text-sm text-slate-500">{t("bo.channelQueue.count", { count: String(rows.length) })}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">{empty}</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.reference")}</th>
                {showPartner && <th className="px-4 py-3 font-semibold">{t("bo.masterConcierge.company")}</th>}
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.client")}</th>
                {showWho && <th className="px-4 py-3 font-semibold">{t("bo.channelQueue.who")}</th>}
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.route")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.state")}</th>
                <th className="px-4 py-3 font-semibold text-right">{t("bo.queue.table.amount")}</th>
                <th className="px-4 py-3 font-semibold">{t("bo.queue.table.inQueueFor")}</th>
                {viewerId !== undefined && <th className="px-4 py-3 font-semibold">{t("bo.claim.column")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => {
                /* FILA-01 · a etiqueta VIP: na coluna de quem pede quando a
                   fila a tem, senão por baixo da referência. */
                const vipTag =
                  row.channel === "vip" ? (
                    <VipTag
                      name={row.vipName}
                      href={vipClientHref({
                        vipClientId: row.vipClientId,
                        vipName: row.vipName,
                        master: showPartner,
                        partnerId: row.partnerId,
                      })}
                      title={t("bo.vipTag.open")}
                    />
                  ) : null
                return (
                <WaitRow key={row.caseId} since={sinces[index]} className="align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/price-checker/${row.caseId}`}
                      className="font-mono font-semibold text-orange-700 hover:underline"
                    >
                      {row.reference}
                    </Link>
                    {vipTag && !showWho && <div className="mt-1">{vipTag}</div>}
                    {row.channel === "ministerio" && row.urgency > 0 && (
                      <div>
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${URGENCY_CLASS[row.urgency as 1 | 2]}`}
                        >
                          {t(`bo.urgency.${row.urgency}`)}
                        </span>
                      </div>
                    )}
                  </td>
                  {showPartner && (
                    <td className="px-4 py-3 text-slate-700">
                      <div className="font-medium">{row.partnerName ?? "—"}</div>
                      <div className="text-xs text-slate-500">{t(`bo.channels.${row.channel}`)}</div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.clientName}</div>
                    <div className="text-xs text-slate-500">{row.clientPhone}</div>
                  </td>
                  {showWho && (
                    <td className="px-4 py-3 text-slate-600">{vipTag ?? row.organisationName ?? "—"}</td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-mono text-slate-900">
                      {row.origin} → {row.destination}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.departDate}
                      {row.returnDate ? ` – ${row.returnDate}` : ""} · {row.paxLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t(`bo.queue.state.${row.state}`)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.amount ? formatMoney(row.amount, row.currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <WaitBadge since={sinces[index]} />
                  </td>
                  {viewerId !== undefined && (
                    <td className="px-4 py-3 text-slate-600">
                      {row.ownerId ? (
                        row.ownerId === viewerId ? (
                          <span className="font-semibold text-emerald-700">{t("bo.claim.yours")}</span>
                        ) : (
                          t("bo.claim.claimedBy", { name: row.claimedByLabel ?? row.claimedByEmail ?? "—" })
                        )
                      ) : row.closedAt ? (
                        "—"
                      ) : (
                        <ClaimButton caseId={row.caseId} />
                      )}
                    </td>
                  )}
                </WaitRow>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
