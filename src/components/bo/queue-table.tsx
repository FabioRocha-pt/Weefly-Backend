"use client"

/**
 * A tabela da fila.
 *
 * Cliente por causa de três coisas: a pesquisa que filtra sem recarregar, o
 * "Reclamar e cotar" que é uma ação, e os relógios — um prazo mostrado por HTML
 * renderizado no servidor está errado no minuto seguinte.
 */

import { Fragment, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { boArchiveCase, boClaimCase } from "@/actions/bo-price-checker"
import { ARCHIVE_REASONS } from "@/lib/pc/archive"
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
import { WAIT_FILTER_CSS, waitSince } from "@/lib/queue-wait"
import { VipTag, vipClientHref } from "@/components/channels/vip-tag"
import { WaitBadge, WaitFilter, WaitRow } from "@/components/channels/wait"

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
  const { t, locale, timeZone } = useI18n()
  const tag = LOCALE_TAGS[locale]
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(search)
  /* FILA-01 · "os pedidos VIP podem ser filtrados na fila". Filtra, não
     reordena: os VIP ficam onde estavam. */
  const [onlyVip, setOnlyVip] = useState(false)
  const vipCount = useMemo(() => rows.filter((row) => row.channel === "vip").length, [rows])
  const [claiming, setClaiming] = useState<string | null>(null)
  /* B2G-13 · quem perde a corrida fica a saber quem ganhou. */
  const [claimMsg, setClaimMsg] = useState<{ caseId: string; text: string } | null>(null)
  /* OCT-22 · arquivar a partir da fila, com motivo obrigatório. */
  const [archiving, setArchiving] = useState<{ caseId: string; reason: string; note: string } | null>(null)
  const [archiveMsg, setArchiveMsg] = useState<{ caseId: string; ok: boolean; text: string } | null>(null)

  const archive = (row: BoQueueRow) => {
    if (!archiving || archiving.caseId !== row.caseId) return
    if (!window.confirm(t("bo.caseView.header.archiveConfirm", { ref: row.reference ?? t("bo.caseView.header.thisCase") }))) return
    const input = archiving
    startTransition(async () => {
      const result = await boArchiveCase({ caseId: input.caseId, reason: input.reason, note: input.note })
      setArchiveMsg({ caseId: input.caseId, ok: result.ok, text: result.ok ? (result.notice ?? "") : result.error })
      if (result.ok) {
        setArchiving(null)
        router.refresh()
      }
    })
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = onlyVip ? rows.filter((row) => row.channel === "vip") : rows
    if (!q) return pool
    return pool.filter((row) =>
      [row.reference, row.clientName, row.clientPhone, row.origin, row.destination, row.pnr ?? "", row.vipName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query, onlyVip])

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
        {/* FILA-01 · só os pedidos de clientes VIP. */}
        {(vipCount > 0 || onlyVip) && (
          <button
            type="button"
            className={`btn btn-sm${onlyVip ? " btn-primary" : ""}`}
            aria-pressed={onlyVip}
            onClick={() => setOnlyVip((value) => !value)}
          >
            {t("bo.vipTag.filter", { count: vipCount })}
          </button>
        )}
        {/* FILA-02 · só os críticos (mais de 3 dias à espera). */}
        {rows.length > 0 && <WaitFilter scope="bo-queue-table" sinces={rows.map((row) => waitSince(row))} />}
        <span className="tcount">
          {t("bo.queue.table.cases", { count: visible.length })}
        </span>
      </div>

      <style>{WAIT_FILTER_CSS}</style>
      <div className="tablewrap" id="bo-queue-table">
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

                const archiveOpen = archiving?.caseId === row.caseId
                /* FILA-02 · desde quando espera; nulo = já não espera por nada. */
                const since = waitSince(row)
                return (
                  <Fragment key={row.caseId}>
                  <WaitRow since={since}>
                    <td>
                      <div className="ref mono">{row.reference}</div>
                      <div className="ref-sub">
                        {row.agentSlug ? `agent=${row.agentSlug}` : t("bo.queue.table.noAgent")}
                      </div>
                    </td>
                    <td>
                      <div className="cli">{row.clientName}</div>
                      <div className="cli-sub mono">{row.clientPhone}</div>
                      {/* B2G-13 · "os outros veem *reclamado por …*". */}
                      {row.claimedByLabel && (
                        <div className="cli-sub">
                          {mine ? t("bo.claim.yours") : t("bo.claim.claimedBy", { name: row.claimedByLabel })}
                        </div>
                      )}
                    </td>
                    <td>
                      {/* FILA-01 · E6 · um pedido VIP diz que é VIP e de quem, e
                          a etiqueta abre a ficha do cliente. */}
                      {row.channel === "vip" ? (
                        <VipTag
                          name={row.vipName}
                          href={vipClientHref({ vipClientId: row.vipClientId })}
                          title={t("bo.vipTag.open")}
                        />
                      ) : (
                      <span
                        className="chan"
                        title={row.market ? countryName(row.market, tag) : ""}
                      >
                        {/* B2G-21 · o canal do pedido: WEB (Público) ou MIN. */}
                        <i>{row.channel === "ministerio" ? "MIN" : "WEB"}</i>
                        {/* B2G-11 · a urgência do pedido do ministério. */}
                        {row.channel === "ministerio" && row.urgency > 0 && (
                          <i style={{ color: row.urgency === 2 ? "var(--ember)" : "var(--warn)" }}>
                            {t(`bo.urgency.${row.urgency}`)}
                          </i>
                        )}
                        {row.channel === "ministerio"
                          ? row.organisationName ?? t("bo.channels.ministerio")
                          : `Link · ${MARKET_NAME(row.market)}`}
                      </span>
                      )}
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
                      {/* FILA-02 · a cor do tempo de espera e o tempo escrito. Uma
                          entrada que já não espera (emitida, fechada, cancelada)
                          fica com o tempo de sempre, sem cor. */}
                      {since ? (
                        <WaitBadge since={since} />
                      ) : (
                        <div className={`age${late ? " late" : row.waiting === "us" ? " hot" : ""}`}>
                          {elapsedSince(row.submittedAt)}
                        </div>
                      )}
                      <div className="age-sub">{deadlineNote(row, t, tag, timeZone)}</div>
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
                              setClaimMsg(null)
                              startTransition(async () => {
                                const result = await boClaimCase(row.caseId)
                                setClaiming(null)
                                if (!result.ok) setClaimMsg({ caseId: row.caseId, text: result.error })
                                router.refresh()
                              })
                            }}
                          >
                            {t("bo.queue.table.claim")}
                          </button>
                        )}
                        {row.state !== "fechado" && (
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={pending}
                            aria-expanded={archiveOpen}
                            onClick={() => {
                              setArchiveMsg(null)
                              setArchiving(archiveOpen ? null : { caseId: row.caseId, reason: "fechado_fora_plataforma", note: "" })
                            }}
                          >
                            {t("bo.caseView.header.archiveOpen")}
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
                            : row.state === "pago_sem_bilhete" || row.state === "pronto_a_emitir"
                              ? t("bo.queue.table.issue")
                              : row.state === "novo"
                                ? t("bo.queue.table.quote")
                                : t("bo.queue.table.open")}
                        </Link>
                      </div>
                    </td>
                  </WaitRow>
                  {claimMsg?.caseId === row.caseId && (
                    <tr>
                      <td colSpan={9}>
                        <p role="status" style={{ color: "#f87171" }}>
                          {claimMsg.text}
                        </p>
                      </td>
                    </tr>
                  )}
                  {(archiveOpen || archiveMsg?.caseId === row.caseId) && (
                    <tr>
                      <td colSpan={9}>
                        {archiveOpen && archiving && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                            <div className="f">
                              <label>{t("bo.caseView.header.archiveReason")}</label>
                              <select
                                value={archiving.reason}
                                onChange={(e) => setArchiving({ ...archiving, reason: e.target.value })}
                              >
                                {ARCHIVE_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {t(`bo.queue.closedReason.${reason}`)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="f" style={{ flex: 1, minWidth: 220 }}>
                              <label>
                                {archiving.reason === "outro"
                                  ? t("bo.caseView.header.noteRequired")
                                  : t("bo.caseView.header.noteOptional")}
                              </label>
                              <input
                                value={archiving.note}
                                onChange={(e) => setArchiving({ ...archiving, note: e.target.value })}
                                placeholder={t("bo.caseView.header.notePlaceholder")}
                              />
                            </div>
                            <button
                              className="btn btn-sm btn-primary"
                              type="button"
                              disabled={pending || (archiving.reason === "outro" && !archiving.note.trim())}
                              onClick={() => archive(row)}
                            >
                              {pending ? t("bo.caseView.header.archiving") : t("bo.caseView.header.archiveCase")}
                            </button>
                            <button className="btn btn-sm" type="button" onClick={() => setArchiving(null)}>
                              {t("bo.caseView.common.cancel")}
                            </button>
                          </div>
                        )}
                        {archiveMsg?.caseId === row.caseId && archiveMsg.text && (
                          <p role="status" style={{ marginTop: 6, color: archiveMsg.ok ? "#34d399" : "#f87171" }}>
                            {archiveMsg.text}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
function deadlineNote(row: BoQueueRow, t: Translator, tag: string, timeZone: string): string {
  /* T-21 · num caso fechado o prazo já não é notícia; quem o fechou e quando é
     que é. É a única pergunta que se faz sobre um caso arquivado. */
  if (row.closedAt) {
    const when = new Date(row.closedAt).toLocaleDateString(tag, {
      day: "2-digit",
      month: "short",
      timeZone,
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
              timeZone,
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
        timeZone,
      }),
    })
  }

  return row.waiting === "us"
    ? t("bo.queue.deadline.waitingUs")
    : t("bo.queue.deadline.waitingClient")
}
