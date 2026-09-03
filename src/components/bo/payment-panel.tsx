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
  boRejectProof,
  boReopenPayment,
  boSavePayInstructions,
} from "@/actions/bo-price-checker"
import type { PaymentProof, PcPayment } from "@/lib/pc/payment"
import type { BoState } from "@/lib/pc/bo-queue"
import { formatAmountPlain, formatMoney, parseMoney } from "@/lib/proposal-math"
import {
  METHOD_LABEL_PT,
  PAY_METHOD_IDS,
  PAY_METHODS,
  PROOF_REVIEW_HOURS,
  methodLabelPt,
  payMethod,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { humanSize } from "@/lib/pc/format-size"

/* C-33 · a ordem é a do catálogo, e o catálogo é o único sítio onde ela vive. */
const METHODS: PayMethodId[] = PAY_METHOD_IDS

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
        {/*
          C-33 · a via que o cliente escolheu, e o que o agente tem de fornecer.

          Primeiro painel da aba de propósito: é o passo que existe antes de
          haver comprovativo nenhum. O pagamento acontece fora da plataforma —
          o que acontece aqui é dar ao cliente por onde pagar, e mais nada.
        */}
        <BoPayInstructions
          caseId={caseId}
          payment={payment}
          settled={settled}
          viewer={viewer}
        />

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
                        ? methodLabelPt(payment.method)
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
                  {/*
                    X-01 · uma âncora, e não um botão que chama uma ação.

                    O botão pedia o URL assinado ao servidor e só depois fazia
                    `window.open` — e um `window.open` depois de um `await` já
                    não pertence ao clique do utilizador, pelo que o browser o
                    bloqueia como pop-up. O comprovativo não abria, e não havia
                    erro nenhum a dizer porquê.

                    Um `href` abre no próprio gesto. A rota do outro lado
                    verifica a sessão, serve do bucket privado com o tipo certo
                    e devolve o nome original do ficheiro.
                  */}
                  <a
                    className="btn btn-sm"
                    href={`/api/bo/proof/${proof.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir
                  </a>
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
                  {/*
                    C-33 · o seletor de método saiu daqui.

                    A área de validação do comprovativo é, palavra por palavra,
                    "valor recebido, data, referência bancária, validado por".
                    A via de pagamento é escolhida pelo cliente e vive no painel
                    de cima — pedi-la outra vez no momento de confirmar era
                    convidar o agente a contradizer o que o cliente escolheu.
                  */}
                  <div className="f s4">
                    <label>Via escolhida</label>
                    <input value={methodLabelPt(payment.method)} disabled />
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
                          /* C-33 · a via é a que o cliente escolheu, gravada no
                             pagamento. Confirmar não a redefine. */
                          method: payment.method ?? undefined,
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

/**
 * C-33 · a aba Pagamento reflecte o método que o cliente escolheu.
 *
 * O que estava aqui era um seletor com seis famílias de pagamento — o agente
 * escolhia uma no momento de confirmar, o que é o gesto errado na altura
 * errada: quem escolhe a via é o cliente, e escolhe-a antes de pagar, não
 * depois. O painel mostrava as seis a toda a hora e não tinha onde guardar o
 * link ou a referência que o agente arranja.
 *
 * Agora:
 *
 *   · a via escolhida está no topo, em letra grande. É a primeira coisa que
 *     quem abre a aba precisa de saber;
 *   · só aparecem os campos daquela via. Um Stripe pede um link, um Instapay
 *     uma referência, o Vinti4/24 aceita os dois — e mais nenhum campo existe
 *     no ecrã, porque um campo a mais é um campo que alguém preenche por
 *     engano;
 *   · valor a cobrar, prazo, e a acção de enviar ao cliente, que os cinco
 *     métodos têm em comum;
 *   · **a plataforma não gera nada.** Guarda o que o agente escreve. Um link de
 *     Stripe é criado no Stripe, por uma pessoa, e é essa pessoa que responde
 *     por ele cobrar o valor certo.
 *
 * Quando o cliente ainda não escolheu, o agente pode escolher por ele — ao
 * telefone é exactamente o que acontece — e fica registado que a escolha veio
 * de dentro.
 */
function BoPayInstructions({
  caseId,
  payment,
  settled,
  viewer,
}: {
  caseId: string
  payment: PcPayment
  settled: boolean
  viewer: { label: string; email: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const chosen = payMethod(payment.method)
  const [method, setMethod] = useState<PayMethodId>(chosen?.id ?? "stripe")
  const [link, setLink] = useState(payment.pay_link ?? "")
  const [reference, setReference] = useState(payment.pay_reference ?? "")
  const [dueAt, setDueAt] = useState(
    payment.pay_due_at ? localMoment(payment.pay_due_at) : ""
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = payMethod(method)!
  const wantsLink = active.supply === "link" || active.supply === "either"
  const wantsRef = active.supply === "reference" || active.supply === "either"

  function save(send: boolean) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await boSavePayInstructions({
        caseId,
        paymentId: payment.id,
        method,
        link: wantsLink ? link : undefined,
        reference: wantsRef ? reference : undefined,
        dueAt: dueAt || undefined,
        send,
      })
      if (result.ok) {
        setNotice(result.notice ?? null)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  if (settled) {
    return (
      <div className="panel">
        <div className="panel-h">
          <h3>Como o cliente pagou</h3>
        </div>
        <div className="panel-b">
          <div className="kv">
            <span className="kv-k">Via</span>
            <span className="kv-v">{methodLabelPt(payment.method)}</span>
          </div>
          {(payment.pay_link || payment.pay_reference) && (
            <div className="kv">
              <span className="kv-k">Fornecido</span>
              <span className="kv-v mono" style={{ wordBreak: "break-all" }}>
                {payment.pay_link ?? payment.pay_reference}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <h3>Via escolhida pelo cliente</h3>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          o pagamento acontece fora da plataforma
        </span>
      </div>
      <div className="panel-b">
        {/* A via, em cima e em letra grande. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 13,
          }}
        >
          <span style={{ fontSize: 21, fontWeight: 800, color: "var(--txt)" }}>
            {chosen ? METHOD_LABEL_PT[chosen.id] : "O cliente ainda não escolheu"}
          </span>
          {chosen && payment.pay_provider && (
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              {payment.pay_provider}
            </span>
          )}
          {!chosen && payment.method && (
            <span style={{ fontSize: 12, color: "var(--warn)" }}>
              (registo antigo: {methodLabelPt(payment.method)})
            </span>
          )}
        </div>

        {!chosen && (
          <p className="note" style={{ marginBottom: 13 }}>
            Se combinou a via com o cliente por telefone ou WhatsApp, escolha-a
            aqui. Fica registado que a escolha veio do back-office.
          </p>
        )}

        <div className="fgrid">
          <div className="f s6">
            <label>Via de pagamento</label>
            <select
              value={method}
              disabled={pending}
              onChange={(event) => setMethod(event.target.value as PayMethodId)}
            >
              {METHODS.map((id) => (
                <option key={id} value={id}>
                  {METHOD_LABEL_PT[id]}
                </option>
              ))}
            </select>
            <span className="hint">
              {chosen && chosen.id !== method
                ? `O cliente escolheu ${METHOD_LABEL_PT[chosen.id]}. Mudar aqui muda o que ele vai ver.`
                : "A via que o cliente escolheu no link."}
            </span>
          </div>

          <div className="f s3">
            <label>Valor a cobrar</label>
            <input
              className="mono"
              value={formatMoney(payment.amount, payment.currency)}
              disabled
            />
            <span className="hint">vem da opção escolhida</span>
          </div>

          <div className="f s3">
            <label>Prazo para pagar</label>
            <input
              type="datetime-local"
              value={dueAt}
              disabled={pending}
              onChange={(event) => setDueAt(event.target.value)}
            />
            <span className="hint">vai na mensagem ao cliente</span>
          </div>

          {/* Só os campos da via escolhida. */}
          {wantsLink && (
            <div className={wantsRef ? "f s6" : "f s12"}>
              <label>
                {active.supply === "either" ? "Link (alternativa)" : active.fieldPt}
              </label>
              <input
                className="mono"
                placeholder={active.samplePt}
                value={link}
                disabled={pending}
                onChange={(event) => setLink(event.target.value)}
              />
            </div>
          )}

          {wantsRef && (
            <div className={wantsLink ? "f s6" : "f s12"}>
              <label>
                {active.supply === "either" ? "Referência SISP" : active.fieldPt}
              </label>
              <input
                className="mono"
                placeholder={active.samplePt}
                value={reference}
                disabled={pending}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
          )}
        </div>

        <p className="note" style={{ marginTop: 12 }}>
          O link ou a referência são criados por você, no {METHOD_LABEL_PT[method]} —
          a plataforma não os gera, só os guarda e envia. Confirme que o valor
          cobrado é {formatMoney(payment.amount, payment.currency)}.
        </p>

        {payment.pay_instructions_sent_at && (
          <div className="note ok" style={{ marginTop: 11 }}>
            Instruções enviadas em {dt(payment.pay_instructions_sent_at)}
            {payment.pay_instructions_sent_by_email
              ? ` por ${payment.pay_instructions_sent_by_email}`
              : ""}
            .
          </div>
        )}

        {error && (
          <div className="note bad" style={{ marginTop: 11 }}>
            {error}
          </div>
        )}
        {notice && (
          <div className="note ok" style={{ marginTop: 11 }}>
            {notice}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            className="btn btn-sm btn-primary"
            type="button"
            disabled={pending}
            onClick={() => save(true)}
          >
            {pending ? "A enviar…" : "Gravar e enviar ao cliente"}
          </button>
          <button
            className="btn btn-sm"
            type="button"
            disabled={pending}
            onClick={() => save(false)}
          >
            Gravar sem enviar
          </button>
        </div>
      </div>
    </div>
  )
}

/** `2026-09-05T14:30` — o que um `datetime-local` aceita, em hora local. */
function localMoment(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
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
