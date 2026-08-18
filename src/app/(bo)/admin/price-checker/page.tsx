import Link from "next/link"

import { getBoAccess } from "@/lib/bo-access"
import { loadBoQueue, type BoBucket } from "@/lib/pc/bo-queue"
import { BoQueueTable } from "@/components/bo/queue-table"
import { elapsedSince } from "@/lib/case-status"
import { formatMoney } from "@/lib/proposal-math"

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

const BUCKETS: { id: BoBucket; label: string; tone?: "alert" | "warn" }[] = [
  { id: "por_validar", label: "Comprovativos por validar", tone: "alert" },
  { id: "pagos_sem_bilhete", label: "Pagos, sem bilhete", tone: "alert" },
  { id: "novos_sem_dono", label: "Novos, sem dono", tone: "warn" },
  { id: "a_cotar_meus", label: "A cotar, meus", tone: "warn" },
  { id: "a_expirar", label: "Propostas a expirar" },
  { id: "espera_cliente", label: "Espera pelo cliente" },
  { id: "tudo", label: "Tudo" },
]

export default async function BoQueuePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const access = await getBoAccess()
  if (!access.ok) return null // O layout já mostrou a página de sem acesso.

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

  const queue = await loadBoQueue(
    { bucket, search, market },
    access.identity.userId
  )

  /* Se o balde escolhido está vazio mas há trabalho noutro, a fila não mente:
     mostra o balde vazio com a sua própria mensagem em vez de saltar para outro
     sem avisar. Saltar sozinho faria a contagem no separador parecer errada. */
  const kpis = [
    {
      id: "por_validar" as BoBucket,
      label: "Comprovativos por validar",
      dot: "bad",
      tone: "bad",
      sub: (n: number) =>
        n
          ? `o mais antigo há ${elapsedSince(queue.oldest.por_validar!)}`
          : "nada à espera de nós",
    },
    {
      id: "pagos_sem_bilhete" as BoBucket,
      label: "Pagos, sem bilhete",
      dot: "bad",
      tone: "bad",
      sub: (n: number) =>
        n
          ? `o mais antigo há ${elapsedSince(queue.oldest.pagos_sem_bilhete!)}`
          : "nenhum",
    },
    {
      id: "novos_sem_dono" as BoBucket,
      label: "Novos, sem dono",
      dot: "us",
      tone: "hot",
      sub: (n: number) =>
        n ? `o mais antigo há ${elapsedSince(queue.oldest.novos_sem_dono!)}` : "fila vazia",
    },
    {
      id: "a_cotar_meus" as BoBucket,
      label: "A cotar, meus",
      dot: "us",
      tone: "hot",
      sub: () => access.identity.label,
    },
    {
      id: "a_expirar" as BoBucket,
      label: "Propostas a expirar",
      dot: "off",
      tone: "hot",
      sub: () => "menos de 1 hora",
    },
    {
      id: "espera_cliente" as BoBucket,
      label: "Espera pelo cliente",
      dot: "them",
      tone: "",
      sub: () => "a escolher ou a pagar",
    },
  ]

  const linkFor = (next: Partial<Record<string, string>>) => {
    const params = new URLSearchParams()
    params.set("tab", next.tab ?? bucket)
    if (next.q ?? search) params.set("q", next.q ?? search)
    if (next.mercado ?? market) params.set("mercado", next.mercado ?? market)
    return `/admin/price-checker?${params.toString()}`
  }

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>Price Checker · fila de trabalho</h1>
          <p>
            Pedidos entram sozinhos quando o cliente submete o formulário. O
            cronómetro começa nessa submissão, não na atribuição.
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
            Emitidos este mês
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

      <div className="qtabs">
        {BUCKETS.map((tab) => (
          <Link
            key={tab.id}
            href={linkFor({ tab: tab.id })}
            className={`qtab ${tab.tone && queue.counts[tab.id] ? tab.tone : ""}`}
            aria-pressed={tab.id === bucket}
            style={{ textDecoration: "none" }}
          >
            {tab.label} <span className="n">{queue.counts[tab.id]}</span>
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
