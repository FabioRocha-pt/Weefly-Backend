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
  type BoBucket,
  type BoQueueRow,
} from "@/lib/pc/bo-queue"
import { elapsedSince } from "@/lib/case-status"
import { formatMoney } from "@/lib/proposal-math"
import { countryName } from "@/lib/countries"
import { useI18n } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateOr, type Translator } from "@/i18n/translate"

/* A coluna é estreita: fica o código do país, que é o que a equipa lê de
   relance, com o nome inteiro no title. */
const MARKET_NAME = (iso: string): string => iso || "—"

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
  const { t, locale } = useI18n()
  const tag = LOCALE_TAGS[locale]
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
            placeholder={t("bo.queue.table.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="tcount">
          {t("bo.queue.table.cases", { count: visible.length })}
        </span>
      </div>

      <div className="tablewrap">
        {visible.length === 0 ? (
          <div className="panel-b">
            <p className="note">{t(`bo.queue.empty.${bucket}`)}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("bo.queue.table.reference")}</th>
                <th>{t("bo.queue.table.client")}</th>
                <th>{t("bo.queue.table.origin")}</th>
                <th>{t("bo.queue.table.state")}</th>
                <th>{t("bo.queue.table.route")}</th>
                <th>{t("bo.queue.table.passengers")}</th>
                <th style={{ textAlign: "right" }}>{t("bo.queue.table.amount")}</th>
                <th>{t("bo.queue.table.inQueueFor")}</th>
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
                        {row.agentSlug ? `agent=${row.agentSlug}` : t("bo.queue.table.noAgent")}
                      </div>
                    </td>
                    <td>
                      <div className="cli">{row.clientName}</div>
                      <div className="cli-sub mono">{row.clientPhone}</div>
                    </td>
                    <td>
                      <span
                        className="chan"
                        title={row.market ? countryName(row.market, tag) : ""}
                      >
                        <i>WEB</i>
                        Link · {MARKET_NAME(row.market)}
                      </span>
                    </td>
                    <td>
                      <span className={`state ${BO_STATE_CLASS[row.state]}`}>
                        <span className={`dot ${row.waiting === "bad" ? "bad" : row.waiting}`} />
                        {t(`bo.queue.state.${row.state}`)}
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
                      <div className="age-sub">{deadlineNote(row, t, tag)}</div>
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
                            {t("bo.queue.table.claim")}
                          </button>
                        )}
                        <Link
                          className={`btn btn-sm${row.waiting === "bad" || mine ? " btn-primary" : ""}`}
                          href={`/admin/price-checker/${row.caseId}${
                            row.state === "comprovativo_por_validar" ? "?aba=t-pag" : ""
                          }`}
                        >
                          {row.state === "comprovativo_por_validar"
                            ? t("bo.queue.table.validate")
                            : row.state === "pago_sem_bilhete"
                              ? t("bo.queue.table.issue")
                              : row.state === "novo"
                                ? t("bo.queue.table.quote")
                                : t("bo.queue.table.open")}
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
function deadlineNote(row: BoQueueRow, t: Translator, tag: string): string {
  /* T-21 · num caso fechado o prazo já não é notícia; quem o fechou e quando é
     que é. É a única pergunta que se faz sobre um caso arquivado. */
  if (row.closedAt) {
    const when = new Date(row.closedAt).toLocaleDateString(tag, {
      day: "2-digit",
      month: "short",
      timeZone: "Atlantic/Cape_Verde",
    })
    /* PRO-10 · o motivo, quando foi arquivado e não emitido. */
    const why =
      row.closedReason && row.closedReason !== "emitido"
        ? ` · ${translateOr(t, `bo.queue.closedReason.${row.closedReason}`, row.closedReason)}`
        : ""
    return `${t("bo.queue.deadline.closed", { when })}${why}${row.closedByEmail ? ` · ${row.closedByEmail}` : ""}`
  }
  if (row.state === "emitido") return row.pnr ? `PNR ${row.pnr}` : t("bo.queue.deadline.issued")
  if (row.state === "cancelado") return t("bo.queue.deadline.cancelled")
  if (row.state === "expirado") return t("bo.queue.deadline.linkExpired")

  if (row.deadlineAt) {
    const left = Date.parse(row.deadlineAt) - Date.now()
    const label =
      left <= 0
        ? t("bo.queue.deadline.overdue")
        : t(row.deadlineIsOurs ? "bo.queue.deadline.validateBy" : "bo.queue.deadline.payBy", {
            when: new Date(row.deadlineAt).toLocaleString(tag, {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Atlantic/Cape_Verde",
            }),
          })
    return label
  }

  if (row.offerValidUntil) {
    /* FB-04 · o prazo é agora um instante em UTC e já não a hora de parede que
       o vendedor escrevia. Cortar a string mostrava a hora de Greenwich a quem
       está em Cabo Verde — uma hora a mais, sempre. */
    return t("bo.queue.deadline.offerValidUntil", {
      when: new Date(row.offerValidUntil).toLocaleString(tag, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Atlantic/Cape_Verde",
      }),
    })
  }

  return row.waiting === "us"
    ? t("bo.queue.deadline.waitingUs")
    : t("bo.queue.deadline.waitingClient")
}
