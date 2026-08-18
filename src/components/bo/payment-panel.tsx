"use client"

/**
 * A aba do Pagamento — o painel onde o dinheiro passa a ser verdade.
 *
 * Uma regra manda em tudo o que está aqui: nada fica pago sem alguém marcar a
 * caixa. Não há automatismo, não há "se o valor bate então confirma", não há
 * atalho. O sistema compara valores e diz o que vê; quem assume que o dinheiro
 * entrou é a pessoa cujo nome fica no registo.
 *
 * A outra regra é o relógio. Enquanto o comprovativo espera por nós, corre um
 * prazo — e quando ele acaba o link do cliente expira. O painel mostra-o sempre,
 * porque a alternativa é uma equipa que só descobre o prazo quando ele já
 * passou.
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  boConfirmPayment,
  boExpirePayment,
  boExtendDeadline,
  boProofUrl,
  boRejectProof,
  boReopenPayment,
} from "@/actions/bo-price-checker"
import type { PaymentProof, PcPayment } from "@/lib/pc/payment"
import type { BoState } from "@/lib/pc/bo-queue"
import { formatAmountPlain, formatMoney, parseMoney } from "@/lib/proposal-math"
import {
  METHOD_LABEL_PT,
  PROOF_REVIEW_HOURS,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { humanSize } from "@/lib/pc/format-size"

const METHODS: PayMethodId[] = ["transfer", "link", "card", "momo", "local", "cash"]

const dt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Atlantic/Cape_Verde",
      })
    : "—"

export function BoPaymentPanel({
  caseId,
  reference,
  currency,
  market,
  payment,
  proofs,
  state,
  viewer,
}: {
  caseId: string
  reference: string
  currency: string
  market: string
  payment: PcPayment | null
  proofs: PaymentProof[]
  state: BoState
  viewer: { label: string; email: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [confirmed, setConfirmed] = useState(false)
  const [received, setReceived] = useState(
    payment ? formatAmountPlain(payment.received_amount ?? payment.amount) : ""
  )
  const [method, setMethod] = useState<PayMethodId>(
    (payment?.method as PayMethodId) ?? "transfer"
  )
  const [bankReference, setBankReference] = useState(payment?.bank_reference ?? "")
  const [valueDate, setValueDate] = useState(
    payment?.value_date ?? new Date().toISOString().slice(0, 10)
  )
  const [rejectReason, setRejectReason] = useState("")
  const [showReject, setShowReject] = useState(false)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remaining = useCountdown(
    payment?.proof_status === "recebido"
      ? payment.review_deadline_at
      : (payment?.expires_at ?? null)
  )

  if (!payment) {
    return (
      <div className="cols two tabpane">
        <aside className="panel sticky">
          <div className="panel-h">
            <h3>A cobrar</h3>
          </div>
          <div className="panel-b">
            <p className="note">
              Ainda não há valor a cobrar. O pagamento nasce quando o cliente
              escolhe uma das opções publicadas.
            </p>
          </div>
        </aside>
        <main className="stack">
          <div className="panel">
            <div className="panel-h">
              <h3>Confirmar pagamento</h3>
            </div>
            <div className="panel-b">
              <p className="note">Sem pagamento, não há nada para confirmar.</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const settled = payment.admin_confirmed || payment.status === "COMPLETED"
  const expired = payment.status === "EXPIRED"
  const waitingOnUs = payment.proof_status === "recebido"
  const receivedMinor = received ? parseMoney(received) : payment.amount
  const difference = receivedMinor - payment.amount

  function run(action: () => Promise<{ ok: boolean; notice?: string; error?: string }>) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        setNotice(result.notice ?? null)
        router.refresh()
      } else {
        setError(result.error ?? "Falhou.")
      }
    })
  }

  async function openProof(proof: PaymentProof) {
    setError(null)
    const result = await boProofUrl(proof.storage_path)
    if (result.ok) window.open(result.url, "_blank", "noopener")
    else setError(result.error)
  }

  return (
    <div className="cols two tabpane">
      <aside className="panel sticky">
        <div className="panel-h">
          <h3>A cobrar</h3>
        </div>
        <div className="panel-b">
          <div className="kv">
            <span className="kv-k">Total</span>
            <span className="kv-v mono">{formatMoney(payment.amount, payment.currency)}</span>
          </div>
          <div className="kv">
            <span className="kv-k">Estado</span>
            <span
              className="kv-v"
              style={{
                color: settled
                  ? "var(--ok)"
                  : expired
                    ? "var(--muted)"
                    : waitingOnUs
                      ? "var(--ember)"
                      : "var(--blue)",
              }}
            >
              {settled
                ? "Pago e confirmado"
                : expired
                  ? "Link expirado"
                  : waitingOnUs
                    ? "Comprovativo por validar"
                    : "Aguarda pagamento"}
            </span>
          </div>
          <div className="kv">
            <span className="kv-k">{waitingOnUs ? "Prazo nosso" : "Prazo do cliente"}</span>
            <span className="kv-v">
              {settled
                ? "—"
                : remaining
                  ? `${remaining} · ${dt(
                      waitingOnUs ? payment.review_deadline_at : payment.expires_at
                    )}`
                  : "esgotado"}
            </span>
          </div>
          <div className="kv">
            <span className="kv-k">Mercado</span>
            <span className="kv-v">{market}</span>
          </div>
          <div className="kv">
            <span className="kv-k">Referência</span>
            <span className="kv-v mono">{reference}</span>
          </div>
          {payment.extension_count > 0 && (
            <div className="kv">
              <span className="kv-k">Prazo estendido</span>
              <span className="kv-v">{payment.extension_count}×</span>
            </div>
          )}

          {waitingOnUs && !settled && (
            <p className="note bad" style={{ marginTop: 12 }}>
              O cliente já pagou e está à espera de nós. Se ninguém validar até{" "}
              {dt(payment.review_deadline_at)}, o link expira e o caso volta à
              fila.
            </p>
          )}
        </div>
      </aside>

      <main className="stack">
        {/* ── o comprovativo ── */}
        <div className="panel">
          <div className="panel-h">
            <h3>Comprovativo do cliente</h3>
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
              {proofs.length
                ? `${proofs.length} envio${proofs.length > 1 ? "s" : ""}`
                : "nenhum"}
            </span>
          </div>
          <div className="panel-b">
            {proofs.length === 0 ? (
              <p className="note">
                O cliente ainda não carregou comprovativo.
                {payment.client_declared_paid_at
                  ? ` Declarou ter pago em ${dt(payment.client_declared_paid_at)} pelo método ${
                      payment.method
                        ? METHOD_LABEL_PT[payment.method as PayMethodId] ?? payment.method
                        : "—"
                    } — sem ficheiro para abrir.`
                  : ""}
              </p>
            ) : (
              proofs.map((proof) => (
                <div
                  key={proof.id}
                  className="note"
                  style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
                >
                  <span style={{ flex: 1 }}>
                    <b>{proof.file_name}</b> · {humanSize(proof.size_bytes)} ·{" "}
                    {dt(proof.created_at)}
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>
                      {proof.status === "validado"
                        ? "validado"
                        : proof.status === "rejeitado"
                          ? `rejeitado${proof.review_note ? ` · ${proof.review_note}` : ""}`
                          : "à espera de validação"}
                    </span>
                  </span>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => openProof(proof)}
                  >
                    Abrir
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── confirmar ── */}
        <div className="panel">
          <div className="panel-h">
            <h3>Confirmar pagamento</h3>
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
              sempre manual
            </span>
          </div>
          <div className="panel-b">
            {settled ? (
              <>
                <div className="note ok">
                  Pagamento confirmado em {dt(payment.admin_confirmed_at)}
                  {payment.received_amount
                    ? ` · ${formatMoney(payment.received_amount, payment.currency)}`
                    : ""}
                  {payment.bank_reference ? ` · ${payment.bank_reference}` : ""}.
                </div>
                <p className="note" style={{ marginTop: 12 }}>
                  {state === "pago_sem_bilhete"
                    ? "Falta emitir. É o estado mais crítico do sistema: o cliente pagou e ainda não tem bilhete."
                    : "O caso está fechado do lado do dinheiro."}
                </p>
              </>
            ) : (
              <>
                <div className="fgrid">
                  <div className="f s4">
                    <label>Valor recebido</label>
                    <input
                      className="mono"
                      value={received}
                      onChange={(event) => setReceived(event.target.value)}
                    />
                    <span className="hint">a cobrar: {formatAmountPlain(payment.amount)}</span>
                  </div>
                  <div className="f s4">
                    <label>Método</label>
                    <select
                      value={method}
                      onChange={(event) => setMethod(event.target.value as PayMethodId)}
                    >
                      {METHODS.map((id) => (
                        <option key={id} value={id}>
                          {METHOD_LABEL_PT[id]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="f s4">
                    <label>Data de boa cobrança</label>
                    <input
                      type="date"
                      value={valueDate}
                      onChange={(event) => setValueDate(event.target.value)}
                    />
                  </div>
                  <div className="f s6">
                    <label>Referência do banco</label>
                    <input
                      className="mono"
                      placeholder="TRF20260814-88421"
                      value={bankReference}
                      onChange={(event) => setBankReference(event.target.value)}
                    />
                  </div>
                  <div className="f s6">
                    <label>Validado por</label>
                    <input value={viewer.label} disabled />
                  </div>
                </div>

                <div
                  className={`note ${difference === 0 ? "ok" : difference > 0 ? "warn" : "bad"}`}
                  style={{ marginTop: 12 }}
                >
                  {difference === 0
                    ? "Valor recebido igual ao valor a cobrar. Pode confirmar."
                    : difference > 0
                      ? `Recebeu ${formatMoney(difference, payment.currency)} a mais do que o cobrado. Confirme só se souber porquê.`
                      : `Faltam ${formatMoney(-difference, payment.currency)}. Um pagamento parcial não liberta a emissão — fale com o cliente antes de confirmar.`}
                </div>

                {/*
                  A caixa. Está separada dos campos e com o texto todo, porque é
                  ela que assume a responsabilidade — e uma responsabilidade que
                  se assume por engano não é responsabilidade nenhuma.
                */}
                <label
                  className="chk"
                  style={{
                    marginTop: 14,
                    padding: 12,
                    background: "var(--panel-2)",
                    borderRadius: 10,
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>
                    <b>Confirmo que o valor entrou na conta da WeeFly.</b>
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                      Vi o extrato ou o comprovativo e reconheço o pagamento deste
                      caso. Fica registado em meu nome ({viewer.email}) e o caso é
                      libertado para emissão.
                    </span>
                  </span>
                </label>

                {error && (
                  <div className="note bad" style={{ marginTop: 12 }}>
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="note ok" style={{ marginTop: 12 }}>
                    {notice}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={!confirmed || pending || expired}
                    onClick={() =>
                      run(() =>
                        boConfirmPayment({
                          caseId,
                          paymentId: payment.id,
                          confirmed: true,
                          receivedAmount: received,
                          method,
                          bankReference,
                          valueDate,
                        })
                      )
                    }
                  >
                    Confirmar pagamento e libertar para emissão
                  </button>

                  {proofs.some((p) => p.status === "recebido") && (
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => setShowReject((v) => !v)}
                    >
                      Rejeitar comprovativo
                    </button>
                  )}
                </div>

                {expired && (
                  <p className="note" style={{ marginTop: 12 }}>
                    Este link já expirou. Para o cliente poder pagar outra vez é
                    preciso reabrir o pagamento — o histórico guarda a tentativa
                    que morreu.
                  </p>
                )}

                {showReject && (
                  <div className="f" style={{ marginTop: 12 }}>
                    <label>Porque não serve — o cliente vai ler</label>
                    <textarea
                      style={{ minHeight: 60 }}
                      placeholder="O comprovativo é de outra transferência / não tem a referência / o valor não corresponde"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={pending || rejectReason.trim().length < 3}
                        onClick={() =>
                          run(async () => {
                            const result = await boRejectProof({
                              caseId,
                              paymentId: payment.id,
                              reason: rejectReason.trim(),
                            })
                            if (result.ok) {
                              setShowReject(false)
                              setRejectReason("")
                            }
                            return result
                          })
                        }
                      >
                        Rejeitar e pedir outro
                      </button>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => setShowReject(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── o prazo ── */}
        {!settled && (
          <div className="panel">
            <div className="panel-h">
              <h3>Prazo do link de pagamento</h3>
            </div>
            <div className="panel-b">
              <p className="note">
                O link do cliente não fica aberto para sempre: o preço que ele viu
                tem validade. Sem confirmação até ao prazo, o pagamento expira
                sozinho e o cliente vê o ecrã de opções expiradas, com o botão para
                pedir nova pesquisa.
              </p>

              {error && (
                <div className="note bad" style={{ marginTop: 12 }}>
                  {error}
                </div>
              )}
              {notice && (
                <div className="note ok" style={{ marginTop: 12 }}>
                  {notice}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {!expired && (
                  <>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          boExtendDeadline({
                            caseId,
                            paymentId: payment.id,
                            hours: PROOF_REVIEW_HOURS,
                          })
                        )
                      }
                    >
                      Estender +{PROOF_REVIEW_HOURS}h
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          boExtendDeadline({ caseId, paymentId: payment.id, hours: 24 })
                        )
                      }
                    >
                      Estender +24h
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => boExpirePayment(caseId, payment.id))}
                    >
                      Fechar o link agora
                    </button>
                  </>
                )}

                {expired && (
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => boReopenPayment(caseId, PROOF_REVIEW_HOURS))}
                  >
                    Reabrir pagamento por {PROOF_REVIEW_HOURS}h
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/** O prazo a contar, ao segundo. */
function useCountdown(target: string | null): string | null {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    if (!target) {
      setText(null)
      return
    }
    const tick = () => {
      const left = Date.parse(target) - Date.now()
      if (left <= 0) {
        setText(null)
        return
      }
      const hours = Math.floor(left / 3600_000)
      const minutes = Math.floor((left % 3600_000) / 60000)
      setText(hours > 0 ? `faltam ${hours}h ${minutes}m` : `faltam ${minutes}m`)
    }
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [target])

  return text
}
