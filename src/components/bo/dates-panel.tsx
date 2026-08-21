"use client"

/**
 * BO-04 · a rota e as datas do pedido.
 *
 * Duas regras, e o desenho deste painel é as duas:
 *
 *   · **a origem e o destino não se editam.** Uma rota diferente é um pedido
 *     diferente, e não existe aqui nem campo nem botão para os mudar. Aparecem
 *     como o cliente os escreveu, e é tudo;
 *   · **as datas mudam por uma ação com nome.** Não por um campo que se escreve
 *     em silêncio: "Propor novas datas" pede um motivo, avisa o cliente, deixa o
 *     pedido original visível e assina quem o fez. Mudar as datas de alguém sem
 *     conversa registada é exatamente o que esta regra existe para impedir — e é
 *     também por isso que este item depende do chat interno (NEW-01), que ainda
 *     não existe: até lá, o motivo escrito aqui é o registo que há.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { boProposeNewDates } from "@/actions/bo-price-checker"

const dmy = (iso: string | null | undefined): string => {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : iso
}

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
  const [open, setOpen] = useState(false)
  const [depart, setDepart] = useState(departDate?.slice(0, 10) ?? "")
  const [ret, setRet] = useState(returnDate?.slice(0, 10) ?? "")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const changed = Boolean(original.changedAt && original.departDate)

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
        setOpen(false)
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
          vem do pedido do cliente
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
            <label>Ida</label>
            <input className="mono" value={dmy(departDate)} readOnly disabled />
          </div>
          <div className="f s3">
            <label>Volta</label>
            <input className="mono" value={dmy(returnDate)} readOnly disabled />
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

        {locked ? (
          <p className="note bad" style={{ marginTop: 11 }}>
            {lockedReason}
          </p>
        ) : !open ? (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-sm" type="button" onClick={() => setOpen(true)}>
              Propor novas datas
            </button>
            <span
              style={{ marginLeft: 9, fontSize: 11, color: "var(--muted)" }}
            >
              só quando as datas pedidas não têm lugar
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 13, borderTop: "1px solid var(--line-soft)", paddingTop: 13 }}>
            <div className="fgrid">
              <div className="f s4">
                <label>Nova ida</label>
                <input
                  type="date"
                  value={depart}
                  onChange={(event) => setDepart(event.target.value)}
                />
              </div>
              {roundTrip && (
                <div className="f s4">
                  <label>Nova volta</label>
                  <input
                    type="date"
                    min={depart || undefined}
                    value={ret}
                    onChange={(event) => setRet(event.target.value)}
                  />
                </div>
              )}
              <div className="f s12">
                <label>Motivo · obrigatório</label>
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

            {error && (
              <div className="note bad" style={{ marginTop: 10 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                disabled={pending || !depart || reason.trim().length < 12}
                onClick={submit}
              >
                {pending ? "A gravar…" : "Propor e avisar o cliente"}
              </button>
              <button
                className="btn btn-sm"
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  setError(null)
                  setDepart(departDate?.slice(0, 10) ?? "")
                  setRet(returnDate?.slice(0, 10) ?? "")
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
