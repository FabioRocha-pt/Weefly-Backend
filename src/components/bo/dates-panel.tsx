"use client"

/**
 * BO-04r · a rota e as datas do pedido.
 *
 * Substitui o comportamento do Sprint 1. Duas regras, e o desenho deste painel
 * é as duas:
 *
 *   · **a origem e o destino não se editam.** Uma rota diferente é um pedido
 *     diferente, e não existe aqui nem campo nem botão para os mudar. Aparecem
 *     como o cliente os escreveu, e é tudo;
 *   · **as datas chegam sugeridas, não trancadas.** Vinham em campos
 *     desativados atrás de um botão chamado "Propor novas datas", e o teste ao
 *     Sprint 1 mostrou o que isso custa: para corrigir um dia, era preciso
 *     descobrir que o botão existia. Agora escrevem-se directamente — e no
 *     momento em que uma delas muda, aparece o campo do motivo e o botão de
 *     gravar fica bloqueado até ele estar escrito.
 *
 * O motivo não é burocracia: é a frase que vai no email ao cliente, e é o único
 * registo de que a mudança foi conversada. As datas de alguém não se mudam em
 * silêncio.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { boProposeNewDates } from "@/actions/bo-price-checker"

const dmy = (iso: string | null | undefined): string => {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const day = (iso: string | null | undefined): string => iso?.slice(0, 10) ?? ""

/** O comprimento mínimo do motivo. O mesmo do servidor — ver `datesSchema`. */
const REASON_MIN = 12

export function BoDatesPanel({
  caseId,
  origin,
  destination,
  departDate,
  returnDate,
  tripLabel,
  roundTrip,
  original,
  locked,
  lockedReason,
}: {
  caseId: string
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  tripLabel: string
  roundTrip: boolean
  original: {
    departDate: string | null
    returnDate: string | null
    changedAt: string | null
    changedBy: string | null
    reason: string | null
  }
  /** Emitido ou pago: as datas já não são uma proposta. */
  locked: boolean
  lockedReason: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [depart, setDepart] = useState(day(departDate))
  const [ret, setRet] = useState(day(returnDate))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const changed = Boolean(original.changedAt && original.departDate)

  /*
   * O que faz aparecer o motivo: uma data diferente da que está gravada.
   *
   * Comparado contra o que veio do servidor e não contra o valor inicial do
   * estado, para que voltar atrás — corrigir o engano de digitação — feche o
   * campo outra vez em vez de o deixar aberto a pedir uma justificação para uma
   * mudança que já não existe.
   */
  const dirty = depart !== day(departDate) || (roundTrip && ret !== day(returnDate))
  const reasonMissing = dirty && reason.trim().length < REASON_MIN
  const invalidRange = Boolean(roundTrip && ret && depart && ret < depart)

  function reset() {
    setDepart(day(departDate))
    setRet(day(returnDate))
    setReason("")
    setError(null)
  }

  function submit() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await boProposeNewDates({
        caseId,
        departDate: depart,
        returnDate: roundTrip ? ret || null : null,
        reason,
      })
      if (result.ok) {
        setNotice(result.notice ?? "Datas atualizadas.")
        setReason("")
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Rota e datas</h3>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          as datas vêm do pedido e são editáveis
        </span>
      </div>
      <div className="panel-b">
        <div className="fgrid">
          <div className="f s3">
            <label>Origem</label>
            <input className="mono" value={origin} readOnly disabled />
          </div>
          <div className="f s3">
            <label>Destino</label>
            <input className="mono" value={destination} readOnly disabled />
          </div>
          <div className="f s3">
            <label>
              Ida{" "}
              {depart !== day(departDate) && (
                <span style={{ color: "var(--warn)", fontWeight: 700 }}>· alterada</span>
              )}
            </label>
            <input
              type="date"
              value={depart}
              disabled={locked || pending}
              onChange={(event) => setDepart(event.target.value)}
            />
            <span className="hint">pedido: {dmy(departDate)}</span>
          </div>
          <div className="f s3">
            <label>
              Volta{" "}
              {roundTrip && ret !== day(returnDate) && (
                <span style={{ color: "var(--warn)", fontWeight: 700 }}>· alterada</span>
              )}
            </label>
            <input
              type="date"
              value={ret}
              min={depart || undefined}
              disabled={locked || pending || !roundTrip}
              onChange={(event) => setRet(event.target.value)}
            />
            <span className="hint">
              {roundTrip ? `pedido: ${dmy(returnDate)}` : "viagem só de ida"}
            </span>
          </div>
        </div>

        <p className="note" style={{ marginTop: 11 }}>
          A origem e o destino não são editáveis por nenhum perfil do
          back-office: uma rota diferente é um pedido diferente. Tipo de viagem:{" "}
          <b>{tripLabel}</b>.
        </p>

        {changed && (
          <div className="note warn" style={{ marginTop: 11 }}>
            <b>Pedido original do cliente:</b>{" "}
            <span className="mono">
              {dmy(original.departDate)}
              {original.returnDate ? ` – ${dmy(original.returnDate)}` : ""}
            </span>
            <br />
            Alterado por {original.changedBy ?? "equipa"}
            {original.changedAt
              ? ` em ${new Date(original.changedAt).toLocaleString("pt-PT", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Atlantic/Cape_Verde",
                })}`
              : ""}
            {original.reason ? ` — “${original.reason}”` : ""}
          </div>
        )}

        {notice && (
          <div className="note ok" style={{ marginTop: 11 }}>
            {notice}
          </div>
        )}

        {locked && (
          <p className="note bad" style={{ marginTop: 11 }}>
            {lockedReason}
          </p>
        )}

        {/*
          O motivo aparece porque uma data mudou, e desaparece se ela voltar ao
          que era. É esta a diferença entre o campo obrigatório e um campo que
          está sempre lá a ser ignorado: ele só existe quando há de facto uma
          decisão para justificar.
        */}
        {!locked && dirty && (
          <div
            style={{
              marginTop: 13,
              borderTop: "1px solid var(--line-soft)",
              paddingTop: 13,
            }}
          >
            <div className="fgrid">
              <div className="f s12">
                <label>Motivo · obrigatório para gravar</label>
                <textarea
                  placeholder="O que aconteceu, na frase que o cliente vai ler. Ex.: não há lugares em classe económica no dia 14; a primeira data com lugar é 16."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <span className="hint">
                  Esta frase vai no email ao cliente e fica no registo do caso.
                  Uma proposta já publicada volta a rascunho numa revisão nova.
                </span>
              </div>
            </div>

            {invalidRange && (
              <div className="note bad" style={{ marginTop: 10 }}>
                A volta não pode ser antes da ida.
              </div>
            )}

            {error && (
              <div className="note bad" style={{ marginTop: 10 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                disabled={pending || !depart || reasonMissing || invalidRange}
                onClick={submit}
              >
                {pending ? "A gravar…" : "Gravar datas e avisar o cliente"}
              </button>
              <button
                className="btn btn-sm"
                type="button"
                disabled={pending}
                onClick={reset}
              >
                Repor as datas do pedido
              </button>
              {reasonMissing && (
                <span
                  style={{
                    alignSelf: "center",
                    fontSize: 11,
                    color: "var(--warn)",
                  }}
                >
                  Escreva o motivo para poder gravar.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
