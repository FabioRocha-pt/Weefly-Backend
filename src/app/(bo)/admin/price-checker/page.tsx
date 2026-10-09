import Link from "next/link"

import { getBoAccess } from "@/lib/bo-access"
import { loadBoQueue, type BoBucket } from "@/lib/pc/bo-queue"
import { getBoScope } from "@/lib/bo-scope"
import { BoQueueTable } from "@/components/bo/queue-table"
import { elapsedSince } from "@/lib/case-status"
import { formatMoney } from "@/lib/proposal-math"
import { getBoI18n } from "@/i18n/bo-server"
import { partnerChannels } from "@/lib/channel-gate"
import { CASE_CHANNEL_OF, type CaseChannel } from "@/lib/channels"

/**
 * B1 · a fila de trabalho.
 *
 * Os pedidos entram sozinhos quando o cliente submete o formulário do Price
 * Checker, e o cronómetro começa nessa submissão — não em quando alguém os
 * reclamou. É a diferença entre medir o serviço e medir a equipa.
 *
 * Os separadores são baldes de trabalho, não filtros de estado: o primeiro é o
 * que dói mais (comprovativos por validar, onde o cliente já pagou e nós ainda
 * não confirmámos) e o último é tudo.
 */

export const dynamic = "force-dynamic"

const BUCKETS: { id: BoBucket; tone?: "alert" | "warn" }[] = [
  { id: "por_validar", tone: "alert" },
  { id: "pagos_sem_bilhete", tone: "alert" },
  { id: "novos_sem_dono", tone: "warn" },
  { id: "a_cotar_meus", tone: "warn" },
  { id: "a_expirar" },
  { id: "espera_cliente" },
  { id: "tudo" },
  /* T-21 · o último da fila, porque é o que não tem trabalho dentro. */
  { id: "fechados" },
]

export default async function BoQueuePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const access = await getBoAccess()
  if (!access.ok) return null // O layout já mostrou a página de sem acesso.

  const { t } = await getBoI18n()

  const one = (key: string) =>
    Array.isArray(searchParams[key])
      ? ((searchParams[key] as string[])[0] ?? "")
      : ((searchParams[key] as string | undefined) ?? "")

  const requested = one("tab") as BoBucket
  const bucket: BoBucket = BUCKETS.some((b) => b.id === requested)
    ? requested
    : "por_validar"

  const search = one("q")
  const market = one("mercado")

  /* B2G-21 · o filtro por canal (`?canal=publico|vip|ministerio`), só com os
     canais ligados da empresa — e só aparece quando há mais de um. */
  const tenant = access.identity.tenant
  const caseChannels: CaseChannel[] = tenant
    ? (await partnerChannels(tenant.partnerId)).map((c) => CASE_CHANNEL_OF[c])
    : []
  const askedChannel = one("canal") as CaseChannel
  const channel = caseChannels.includes(askedChannel) ? askedChannel : ""

  const queue = await loadBoQueue(
    await getBoScope(),
    { bucket, search, market, ...(channel ? { channel } : {}) },
    access.identity.userId
  )

  /* Se o balde escolhido está vazio mas há trabalho noutro, a fila não mente:
     mostra o balde vazio com a sua própria mensagem em vez de saltar para outro
     sem avisar. Saltar sozinho faria a contagem no separador parecer errada. */
  const kpis = [
    {
      id: "por_validar" as BoBucket,
      label: t("bo.queue.bucket.por_validar"),
      dot: "bad",
      tone: "bad",
      sub: (n: number) =>
        n
          ? t("bo.queue.kpi.oldest", { tempo: elapsedSince(queue.oldest.por_validar!) })
          : t("bo.queue.kpi.nothingWaiting"),
    },
    {
      id: "pagos_sem_bilhete" as BoBucket,
      label: t("bo.queue.bucket.pagos_sem_bilhete"),
      dot: "bad",
      tone: "bad",
      sub: (n: number) =>
        n
          ? t("bo.queue.kpi.oldest", { tempo: elapsedSince(queue.oldest.pagos_sem_bilhete!) })
          : t("bo.queue.kpi.none"),
    },
    {
      id: "novos_sem_dono" as BoBucket,
      label: t("bo.queue.bucket.novos_sem_dono"),
      dot: "us",
      tone: "hot",
      sub: (n: number) =>
        n ? t("bo.queue.kpi.oldest", { tempo: elapsedSince(queue.oldest.novos_sem_dono!) })
          : t("bo.queue.kpi.emptyQueue"),
    },
    {
      id: "a_cotar_meus" as BoBucket,
      label: t("bo.queue.bucket.a_cotar_meus"),
      dot: "us",
      tone: "hot",
      sub: () => access.identity.label,
    },
    {
      id: "a_expirar" as BoBucket,
      label: t("bo.queue.bucket.a_expirar"),
      dot: "off",
      tone: "hot",
      sub: () => t("bo.queue.kpi.underAnHour"),
    },
    {
      id: "espera_cliente" as BoBucket,
      label: t("bo.queue.bucket.espera_cliente"),
      dot: "them",
      tone: "",
      sub: () => t("bo.queue.kpi.choosingOrPaying"),
    },
  ]

  const linkFor = (next: Partial<Record<string, string>>) => {
    const params = new URLSearchParams()
    params.set("tab", next.tab ?? bucket)
    if (next.q ?? search) params.set("q", next.q ?? search)
    if (next.mercado ?? market) params.set("mercado", next.mercado ?? market)
    const nextChannel = next.canal ?? channel
    if (nextChannel) params.set("canal", nextChannel)
    return `/admin/price-checker?${params.toString()}`
  }

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>{t("bo.queue.title")}</h1>
          <p>
            {t("bo.queue.intro")}
          </p>
        </div>
      </div>

      <div className="kpis">
        {kpis.map((kpi) => {
          const value = queue.counts[kpi.id]
          return (
            <Link
              key={kpi.id}
              href={linkFor({ tab: kpi.id })}
              className={`kpi ${value ? kpi.tone : ""}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="kpi-k">
                <span className={`dot ${kpi.dot}`} />
                {kpi.label}
              </div>
              <div className="kpi-v">{value}</div>
              <div className="kpi-s">{kpi.sub(value)}</div>
            </Link>
          )
        })}
        <div className="kpi">
          <div className="kpi-k">
            <span className="dot done" />
            {t("bo.queue.kpi.issuedThisMonth")}
          </div>
          <div className="kpi-v">{queue.issuedThisMonth.count}</div>
          <div className="kpi-s">
            {formatMoney(
              queue.issuedThisMonth.revenue,
              queue.issuedThisMonth.currency
            )}
          </div>
        </div>
      </div>

      {caseChannels.length > 1 && (
        <div className="qtabs" aria-label={t("bo.channels.filter")}>
          <Link
            href={linkFor({ canal: "" })}
            className="qtab"
            aria-pressed={!channel}
            style={{ textDecoration: "none" }}
          >
            {t("bo.channels.all")}
          </Link>
          {caseChannels.map((c) => (
            <Link
              key={c}
              href={linkFor({ canal: c })}
              className="qtab"
              aria-pressed={channel === c}
              style={{ textDecoration: "none" }}
            >
              {t(`bo.channels.${c}`)}
            </Link>
          ))}
        </div>
      )}

      <div className="qtabs">
        {BUCKETS.map((tab) => (
          <Link
            key={tab.id}
            href={linkFor({ tab: tab.id })}
            className={`qtab ${tab.tone && queue.counts[tab.id] ? tab.tone : ""}`}
            aria-pressed={tab.id === bucket}
            style={{ textDecoration: "none" }}
          >
            {t(`bo.queue.bucket.${tab.id}`)} <span className="n">{queue.counts[tab.id]}</span>
          </Link>
        ))}
      </div>

      <BoQueueTable
        rows={queue.rows}
        bucket={bucket}
        search={search}
        viewerId={access.identity.userId}
      />

      <div className="spacer" />
    </div>
  )
}
