"use client"

/**
 * A tabela da fila.
 *
 * Cliente por causa de três coisas: a pesquisa que filtra sem recarregar, o
 * "Reclamar e cotar" que é uma ação, e os relógios — um prazo mostrado por HTML
 * renderizado no servidor está errado no minuto seguinte.
 */

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { boClaimCase } from "@/actions/bo-price-checker"
import {
  BO_STATE_CLASS,
  BO_STATE_LABEL,
  type BoBucket,
  type BoQueueRow,
} from "@/lib/pc/bo-queue"
import { elapsedSince } from "@/lib/case-status"
import { formatMoney } from "@/lib/proposal-math"
import { CCS } from "@/lib/pc/catalog"

const EMPTY: Record<BoBucket, string> = {
  por_validar: "Nenhum comprovativo à espera de validação. Este é o balde que nunca deve ter fila.",
  pagos_sem_bilhete: "Nenhum caso pago sem bilhete emitido.",
  novos_sem_dono: "Todos os pedidos novos têm dono.",
  a_cotar_meus: "Não tem casos seus em cotação.",
  a_expirar: "Nenhuma proposta a expirar na próxima hora.",
  espera_cliente: "Nenhum caso à espera do cliente.",
  tudo: "Ainda não entrou nenhum pedido pelo Price Checker.",
}

const MARKET_NAME = (prefix: string): string =>
  CCS.find((c) => c.c === prefix)?.co ?? prefix

export function BoQueueTable({
  rows,
  bucket,
  search,
  viewerId,
}: {
  rows: BoQueueRow[]
  bucket: BoBucket
  search: string
  viewerId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(search)
  const [claiming, setClaiming] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.reference, row.clientName, row.clientPhone, row.origin, row.destination, row.pnr ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query])

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="6.8" cy="6.8" r="4.8" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Referência, nome, telefone, PNR ou rota"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="tcount">
          {visible.length} {visible.length === 1 ? "caso" : "casos"}
        </span>
      </div>

      <div className="tablewrap">
        {visible.length === 0 ? (
          <div className="panel-b">
            <p className="note">{EMPTY[bucket]}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Referência</th>
                <th>Cliente</th>
                <th>Origem</th>
                <th>Estado</th>
                <th>Rota</th>
                <th>Passageiros</th>
                <th style={{ textAlign: "right" }}>Valor</th>
                <th>Na fila há</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const mine = row.ownerId === viewerId
                const unclaimed = !row.ownerId
                const late =
                  row.deadlineIsOurs &&
                  row.deadlineAt &&
                  Date.parse(row.deadlineAt) < Date.now() + 6 * 3600_000

                return (
                  <tr key={row.caseId}>
                    <td>
                      <div className="ref mono">{row.reference}</div>
                      <div className="ref-sub">
                        {row.agentSlug ? `agent=${row.agentSlug}` : "sem agente"}
                      </div>
                    </td>
                    <td>
                      <div className="cli">{row.clientName}</div>
                      <div className="cli-sub mono">{row.clientPhone}</div>
                    </td>
                    <td>
                      <span className="chan">
                        <i>WEB</i>
                        Link · {MARKET_NAME(row.market)}
                      </span>
                    </td>
                    <td>
                      <span className={`state ${BO_STATE_CLASS[row.state]}`}>
                        <span className={`dot ${row.waiting === "bad" ? "bad" : row.waiting}`} />
                        {BO_STATE_LABEL[row.state]}
                      </span>
                    </td>
                    <td>
                      <div className="route mono">
                        {row.origin} → {row.destination}
                      </div>
                      <div className="route-sub">
                        {row.departDate?.slice(5) ?? ""}
                        {row.returnDate ? ` – ${row.returnDate.slice(5)}` : ""} ·{" "}
                        {row.currency}
                      </div>
                    </td>
                    <td>{row.paxLabel}</td>
                    <td className="money mono">
                      {row.amount ? formatMoney(row.amount, row.currency) : "—"}
                    </td>
                    <td>
                      <div className={`age${late ? " late" : row.waiting === "us" ? " hot" : ""}`}>
                        {elapsedSince(row.submittedAt)}
                      </div>
                      <div className="age-sub">{deadlineNote(row)}</div>
                    </td>
                    <td>
                      <div className="rowacts">
                        {unclaimed && (
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={pending && claiming === row.caseId}
                            onClick={() => {
                              setClaiming(row.caseId)
                              startTransition(async () => {
                                await boClaimCase(row.caseId)
                                setClaiming(null)
                                router.refresh()
                              })
                            }}
                          >
                            Reclamar
                          </button>
                        )}
                        <Link
                          className={`btn btn-sm${row.waiting === "bad" || mine ? " btn-primary" : ""}`}
                          href={`/admin/price-checker/${row.caseId}${
                            row.state === "comprovativo_por_validar" ? "?aba=t-pag" : ""
                          }`}
                        >
                          {row.state === "comprovativo_por_validar"
                            ? "Validar"
                            : row.state === "pago_sem_bilhete"
                              ? "Emitir"
                              : row.state === "novo"
                                ? "Cotar"
                                : "Abrir"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/**
 * A linha pequena debaixo do tempo: de quem é o prazo que está a correr.
 *
 * Distinguir os dois é o ponto. "prazo nosso" é uma dívida da equipa; "prazo do
 * cliente" é uma espera normal.
 */
function deadlineNote(row: BoQueueRow): string {
  if (row.state === "emitido") return row.pnr ? `PNR ${row.pnr}` : "emitido"
  if (row.state === "cancelado") return "cancelado"
  if (row.state === "expirado") return "link expirado"

  if (row.deadlineAt) {
    const left = Date.parse(row.deadlineAt) - Date.now()
    const label =
      left <= 0
        ? "prazo esgotado"
        : `${row.deadlineIsOurs ? "validar" : "pagar"} até ${new Date(
            row.deadlineAt
          ).toLocaleString("pt-PT", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Atlantic/Cape_Verde",
          })}`
    return label
  }

  if (row.offerValidUntil) {
    return `proposta válida até ${row.offerValidUntil.slice(11, 16)}`
  }

  return row.waiting === "us" ? "à espera de nós" : "à espera do cliente"
}
