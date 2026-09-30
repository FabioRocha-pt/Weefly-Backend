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
  PAY_METHOD_IDS,
  PAY_METHODS,
  PROOF_REVIEW_HOURS,
  methodLabelPt,
  payMethod,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { humanSize } from "@/lib/pc/format-size"
import { LOCALE_TAGS } from "@/i18n/config"
import { useI18n } from "@/i18n/provider"
import { translateOr, type Translator } from "@/i18n/translate"

/* C-33 · a ordem é a do catálogo, e o catálogo é o único sítio onde ela vive. */
const METHODS: PayMethodId[] = PAY_METHOD_IDS

/** I18N-01 · a data na língua do agente; o fuso continua o de Cabo Verde. */
function useDt() {
  const { locale } = useI18n()
  const tag = LOCALE_TAGS[locale]
  return (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(tag, {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Atlantic/Cape_Verde",
        })
      : "—"
}

/** I18N-01 · a etiqueta do método no ecrã; um código desconhecido cai na do catálogo. */
const methodLabel = (t: Translator, id: string | null | undefined) =>
  id ? translateOr(t, `bo.payments.method.${id}`, methodLabelPt(id)) : "—"

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
  const { t } = useI18n()
  const dt = useDt()

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
            <h3>{t("bo.payments.summary.title")}</h3>
          </div>
          <div className="panel-b">
            <p className="note">{t("bo.payments.summary.noPayment")}</p>
          </div>
        </aside>
        <main className="stack">
          <div className="panel">
            <div className="panel-h">
              <h3>{t("bo.payments.confirm.title")}</h3>
            </div>
            <div className="panel-b">
              <p className="note">{t("bo.payments.confirm.noPayment")}</p>
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
        setError(result.error ?? t("bo.payments.confirm.failed"))
      }
    })
  }

  return (
    <div className="cols two tabpane">
      <aside className="panel sticky">
        <div className="panel-h">
          <h3>{t("bo.payments.summary.title")}</h3>
        </div>
        <div className="panel-b">
          <div className="kv">
            <span className="kv-k">{t("bo.payments.summary.total")}</span>
            <span className="kv-v mono">{formatMoney(payment.amount, payment.currency)}</span>
          </div>
          <div className="kv">
            <span className="kv-k">{t("bo.payments.summary.status")}</span>
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
                ? t("bo.payments.summary.statusSettled")
                : expired
                  ? t("bo.payments.summary.statusExpired")
                  : waitingOnUs
                    ? t("bo.payments.summary.statusWaitingOnUs")
                    : t("bo.payments.summary.statusAwaiting")}
            </span>
          </div>
          <div className="kv">
            <span className="kv-k">
              {waitingOnUs
                ? t("bo.payments.summary.deadlineOurs")
                : t("bo.payments.summary.deadlineClient")}
            </span>
            <span className="kv-v">
              {settled
                ? "—"
                : remaining
                  ? `${remaining} · ${dt(
                      waitingOnUs ? payment.review_deadline_at : payment.expires_at
                    )}`
                  : t("bo.payments.summary.deadlineOver")}
            </span>
          </div>
          <div className="kv">
            <span className="kv-k">{t("bo.payments.summary.market")}</span>
            <span className="kv-v">{market}</span>
          </div>
          <div className="kv">
            <span className="kv-k">{t("bo.payments.summary.reference")}</span>
            <span className="kv-v mono">{reference}</span>
          </div>
          {payment.extension_count > 0 && (
            <div className="kv">
              <span className="kv-k">{t("bo.payments.summary.extended")}</span>
              <span className="kv-v">{payment.extension_count}×</span>
            </div>
          )}

          {waitingOnUs && !settled && (
            <p className="note bad" style={{ marginTop: 12 }}>
              {t("bo.payments.summary.waitingOnUsWarning", {
                date: dt(payment.review_deadline_at),
              })}
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
            <h3>{t("bo.payments.proof.title")}</h3>
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
              {proofs.length
                ? t("bo.payments.proof.count", { count: proofs.length })
                : t("bo.payments.proof.none")}
            </span>
          </div>
          <div className="panel-b">
            {proofs.length === 0 ? (
              <p className="note">
                {t("bo.payments.proof.empty")}
                {payment.client_declared_paid_at
                  ? t("bo.payments.proof.declaredPaid", {
                      date: dt(payment.client_declared_paid_at),
                      method: methodLabel(t, payment.method),
                    })
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
                        ? t("bo.payments.proof.validated")
                        : proof.status === "rejeitado"
                          ? `${t("bo.payments.proof.rejected")}${proof.review_note ? ` · ${proof.review_note}` : ""}`
                          : t("bo.payments.proof.awaiting")}
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
                    {t("bo.payments.proof.open")}
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── confirmar ── */}
        <div className="panel">
          <div className="panel-h">
            <h3>{t("bo.payments.confirm.title")}</h3>
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
              {t("bo.payments.confirm.alwaysManual")}
            </span>
          </div>
          <div className="panel-b">
            {settled ? (
              <>
                <div className="note ok">
                  {t("bo.payments.confirm.confirmedAt", { date: dt(payment.admin_confirmed_at) })}
                  {payment.received_amount
                    ? ` · ${formatMoney(payment.received_amount, payment.currency)}`
                    : ""}
                  {payment.bank_reference ? ` · ${payment.bank_reference}` : ""}.
                </div>
                <p className="note" style={{ marginTop: 12 }}>
                  {state === "pago_sem_bilhete"
                    ? t("bo.payments.confirm.paidNoTicket")
                    : t("bo.payments.confirm.closedMoney")}
                </p>
              </>
            ) : (
              <>
                <div className="fgrid">
                  <div className="f s4">
                    <label>{t("bo.payments.confirm.received")}</label>
                    <input
                      className="mono"
                      value={received}
                      onChange={(event) => setReceived(event.target.value)}
                    />
                    <span className="hint">
                      {t("bo.payments.confirm.toCharge", {
                        amount: formatAmountPlain(payment.amount),
                      })}
                    </span>
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
                    <label>{t("bo.payments.confirm.chosenMethod")}</label>
                    <input value={methodLabel(t, payment.method)} disabled />
                  </div>
                  <div className="f s4">
                    <label>{t("bo.payments.confirm.valueDate")}</label>
                    <input
                      type="date"
                      value={valueDate}
                      onChange={(event) => setValueDate(event.target.value)}
                    />
                  </div>
                  <div className="f s6">
                    <label>{t("bo.payments.confirm.bankReference")}</label>
                    <input
                      className="mono"
                      placeholder="TRF20260814-88421"
                      value={bankReference}
                      onChange={(event) => setBankReference(event.target.value)}
                    />
                  </div>
                  <div className="f s6">
                    <label>{t("bo.payments.confirm.validatedBy")}</label>
                    <input value={viewer.label} disabled />
                  </div>
                </div>

                <div
                  className={`note ${difference === 0 ? "ok" : difference > 0 ? "warn" : "bad"}`}
                  style={{ marginTop: 12 }}
                >
                  {difference === 0
                    ? t("bo.payments.confirm.diffEqual")
                    : difference > 0
                      ? t("bo.payments.confirm.diffOver", {
                          amount: formatMoney(difference, payment.currency),
                        })
                      : t("bo.payments.confirm.diffUnder", {
                          amount: formatMoney(-difference, payment.currency),
                        })}
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
                    <b>{t("bo.payments.confirm.checkboxTitle")}</b>
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                      {t("bo.payments.confirm.checkboxBody", { email: viewer.email })}
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
                    {t("bo.payments.confirm.submit")}
                  </button>

                  {proofs.some((p) => p.status === "recebido") && (
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => setShowReject((v) => !v)}
                    >
                      {t("bo.payments.confirm.reject")}
                    </button>
                  )}
                </div>

                {expired && (
                  <p className="note" style={{ marginTop: 12 }}>
                    {t("bo.payments.confirm.expiredNote")}
                  </p>
                )}

                {showReject && (
                  <div className="f" style={{ marginTop: 12 }}>
                    <label>{t("bo.payments.confirm.rejectLabel")}</label>
                    <textarea
                      style={{ minHeight: 60 }}
                      placeholder={t("bo.payments.confirm.rejectPlaceholder")}
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
                        {t("bo.payments.confirm.rejectSubmit")}
                      </button>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => setShowReject(false)}
                      >
                        {t("bo.payments.confirm.cancel")}
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
              <h3>{t("bo.payments.deadline.title")}</h3>
            </div>
            <div className="panel-b">
              <p className="note">{t("bo.payments.deadline.body")}</p>

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
                      {t("bo.payments.deadline.extend", { hours: PROOF_REVIEW_HOURS })}
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
                      {t("bo.payments.deadline.extend", { hours: 24 })}
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => boExpirePayment(caseId, payment.id))}
                    >
                      {t("bo.payments.deadline.closeNow")}
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
                    {t("bo.payments.deadline.reopen", { hours: PROOF_REVIEW_HOURS })}
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
  const { t } = useI18n()
  const dt = useDt()

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
        /* T-11 · o `datetime-local` não tem fuso: "14:30" é a hora de quem
           está a escrever. O servidor corre em UTC e lia-o como UTC — em Cabo
           Verde cada gravação recuava o prazo uma hora, e registava uma
           alteração que ninguém fez. O browser sabe o fuso; converte aqui. */
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
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
          <h3>{t("bo.payments.instructions.settledTitle")}</h3>
        </div>
        <div className="panel-b">
          <div className="kv">
            <span className="kv-k">{t("bo.payments.instructions.via")}</span>
            <span className="kv-v">{methodLabel(t, payment.method)}</span>
          </div>
          {(payment.pay_link || payment.pay_reference) && (
            <div className="kv">
              <span className="kv-k">{t("bo.payments.instructions.supplied")}</span>
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
        <h3>{t("bo.payments.instructions.title")}</h3>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          {t("bo.payments.instructions.outsidePlatform")}
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
            {chosen
              ? t(`bo.payments.method.${chosen.id}`)
              : t("bo.payments.instructions.notChosen")}
          </span>
          {chosen && payment.pay_provider && (
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              {payment.pay_provider}
            </span>
          )}
          {!chosen && payment.method && (
            <span style={{ fontSize: 12, color: "var(--warn)" }}>
              {t("bo.payments.instructions.legacy", {
                method: methodLabel(t, payment.method),
              })}
            </span>
          )}
        </div>

        {!chosen && (
          <p className="note" style={{ marginBottom: 13 }}>
            {t("bo.payments.instructions.chooseForClient")}
          </p>
        )}

        <div className="fgrid">
          <div className="f s6">
            <label>{t("bo.payments.instructions.methodLabel")}</label>
            <select
              value={method}
              disabled={pending}
              onChange={(event) => setMethod(event.target.value as PayMethodId)}
            >
              {METHODS.map((id) => (
                <option key={id} value={id}>
                  {t(`bo.payments.method.${id}`)}
                </option>
              ))}
            </select>
            <span className="hint">
              {chosen && chosen.id !== method
                ? t("bo.payments.instructions.clientChoseOther", {
                    method: t(`bo.payments.method.${chosen.id}`),
                  })
                : t("bo.payments.instructions.clientChoseHint")}
            </span>
          </div>

          <div className="f s3">
            <label>{t("bo.payments.instructions.amount")}</label>
            <input
              className="mono"
              value={formatMoney(payment.amount, payment.currency)}
              disabled
            />
            <span className="hint">{t("bo.payments.instructions.amountHint")}</span>
          </div>

          <div className="f s3">
            <label>{t("bo.payments.instructions.dueAt")}</label>
            <input
              type="datetime-local"
              value={dueAt}
              disabled={pending}
              onChange={(event) => setDueAt(event.target.value)}
            />
            <span className="hint">{t("bo.payments.instructions.dueAtHint")}</span>
          </div>

          {/* Só os campos da via escolhida. */}
          {wantsLink && (
            <div className={wantsRef ? "f s6" : "f s12"}>
              <label>
                {active.supply === "either"
                  ? t("bo.payments.instructions.linkAlternative")
                  : t(`bo.payments.field.${active.id}`)}
              </label>
              <input
                className="mono"
                placeholder={t(`bo.payments.sample.${active.id}`)}
                value={link}
                disabled={pending}
                onChange={(event) => setLink(event.target.value)}
              />
            </div>
          )}

          {wantsRef && (
            <div className={wantsLink ? "f s6" : "f s12"}>
              <label>
                {active.supply === "either"
                  ? t("bo.payments.instructions.sispReference")
                  : t(`bo.payments.field.${active.id}`)}
              </label>
              <input
                className="mono"
                placeholder={t(`bo.payments.sample.${active.id}`)}
                value={reference}
                disabled={pending}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
          )}
        </div>

        <p className="note" style={{ marginTop: 12 }}>
          {t("bo.payments.instructions.createdByYou", {
            method: t(`bo.payments.method.${method}`),
            amount: formatMoney(payment.amount, payment.currency),
          })}
        </p>

        {payment.pay_instructions_sent_at && (
          <div className="note ok" style={{ marginTop: 11 }}>
            {payment.pay_instructions_sent_by_email
              ? t("bo.payments.instructions.sentAtBy", {
                  date: dt(payment.pay_instructions_sent_at),
                  email: payment.pay_instructions_sent_by_email,
                })
              : t("bo.payments.instructions.sentAt", {
                  date: dt(payment.pay_instructions_sent_at),
                })}
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
            {pending
              ? t("bo.payments.instructions.sending")
              : t("bo.payments.instructions.saveAndSend")}
          </button>
          <button
            className="btn btn-sm"
            type="button"
            disabled={pending}
            onClick={() => save(false)}
          >
            {t("bo.payments.instructions.saveOnly")}
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
  const { t } = useI18n()

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
      setText(
        hours > 0
          ? t("bo.payments.countdown.hoursMinutes", { hours, minutes })
          : t("bo.payments.countdown.minutes", { minutes })
      )
    }
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [target, t])

  return text
}
