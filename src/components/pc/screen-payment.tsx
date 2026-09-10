"use client"

/**
 * WeeFly Price Checker — o ecrã de pagamento.
 *
 * C-33 · cinco vias, e o cliente **escolhe** uma em vez de pagar aqui.
 *
 * Eram seis famílias de pagamento ordenadas pelo país, e uma delas — a
 * transferência — pedia comprovativo. O Sprint 3 muda a premissa: "o pagamento
 * acontece fora da plataforma, a validação acontece dentro dela". O cliente
 * escolhe Stripe, Vinti4/24, Revolut, Instapay ou PayPal; a escolha chega ao
 * back-office; um agente monta o link ou a referência à mão e envia-lhos. Sem
 * transferência bancária, que esta fase remove.
 *
 * O que não mudou é o fim: o ficheiro sobe para um bucket privado, a equipa
 * abre-o, compara o valor e marca a caixa. Até essa caixa ser marcada, nada
 * está pago — e agora as cinco vias passam por lá, porque nenhuma delas nos
 * avisa sozinha de que o dinheiro entrou.
 *
 * O que este ecrã promete ao cliente é exatamente o que o back-office pode
 * cumprir: verificamos em horário de expediente, e há um prazo. Se o prazo
 * passar sem confirmação, o link expira e ele vê o ecrã P8 — não uma página
 * pendurada para sempre.
 */

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  declarePcPaid,
  sendPcMessage,
  setPcPayMethod,
  uploadPcProof,
} from "@/actions/pc"
import type { PcState } from "@/lib/pc/state"
import {
  PAY_METHODS,
  PROOF_MAX_BYTES,
  PROOF_REVIEW_HOURS,
  type PayMethod,
  type PayMethodId,
} from "@/lib/pc/catalog"
import type { PcPayment } from "@/lib/pc/payment"
import { countryName } from "@/lib/countries"
import { money } from "@/lib/pc/format"
import { IcFile, IcWa, MethodIcon, Rows, Sentence } from "@/components/pc/bits"
import { CopyButton, WaButton, useToast } from "@/components/pc/chrome"
import { PickedOption } from "@/components/pc/picked-option"
import { useI18n, useT } from "@/i18n/provider"
import { methodLabel } from "@/lib/pc/catalog"

export function ScreenP7Pay({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
  const t = useT()
  const [pending, startTransition] = useTransition()

  const payment = state.payment
  /* O país vem da escolha do cliente e não do indicativo: o +1 é de vinte
     países, e é o país que decide os métodos de pagamento e o banco. */
  const country = state.contact.country
  /* C-33 · os cinco métodos são os mesmos em todo o mundo. Nenhum deles é
     fornecido pela plataforma, pelo que o país deixou de decidir a lista — o
     que decide é o que o agente consegue montar do outro lado. */
  const methods = PAY_METHODS

  const [method, setMethod] = useState<PayMethodId>(() => {
    const stored = payment?.method
    return methods.some((m) => m.id === stored)
      ? (stored as PayMethodId)
      : methods[0].id
  })
  const [provider, setProvider] = useState<string | null>(payment?.pay_provider ?? null)
  const [declared, setDeclared] = useState(Boolean(payment?.client_declared_paid_at))
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  /*
   * Sem pagamento não há nada a mostrar — e a partir da BO-02 isto é um estado
   * possível: o link de pagamento nasce quando os passaportes ficam completos, e
   * se essa escrita falhar o cliente aterra aqui. Dizer-lhe o que se passa é
   * melhor do que um ecrã em branco.
   */
  if (!payment) {
    return (
      <main className="shell view">
        <div className="card">
          <h2>{t("pc.pay.preparingTitle")}</h2>
          <p className="mnote" style={{ marginTop: 8 }}>
            {t("pc.pay.preparing")}
          </p>
        </div>
        <div className="spacer" />
      </main>
    )
  }

  const total = payment.amount
  const currency = payment.currency
  const rejected = payment.proof_status === "rejeitado"

  function pickMethod(next: PayMethodId) {
    if (next === method) return
    setMethod(next)
    setProvider(null)
    setDeclared(false)
    setError(null)
    /* Gravado à medida que ele escolhe, e não só no fim: se o cliente
       desaparecer a meio, o back-office sabe por onde ele ia pagar. */
    void setPcPayMethod(state.token, next, null)
  }

  /*
   * C-33 · `pickProvider` saiu.
   *
   * Os provedores eram sub-escolhas dentro de uma família: dentro de "Payment
   * link" havia Revolut, Wise e PayPal. Agora o método **é** o provedor, e uma
   * segunda escolha por baixo dele não tem nada para escolher. A coluna
   * `pay_provider` fica na base para os casos antigos a poderem mostrar.
   */

  function takeFile(candidate: File | null | undefined) {
    if (!candidate) return
    if (candidate.size > PROOF_MAX_BYTES) {
      setError(t("pc.pay.fileTooBig"))
      return
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(candidate.type)) {
      setError(t("pc.pay.fileWrongType"))
      return
    }
    setError(null)
    setFile(candidate)
  }

  function sendProof() {
    if (!file) {
      setError(t("pc.pay.attachProof"))
      return
    }
    const data = new FormData()
    data.set("proof", file)
    data.set("method", method)
    if (provider) data.set("provider", provider)

    startTransition(async () => {
      const result = await uploadPcProof(state.token, data)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast(t("pc.pay.proofReceived"))
      router.refresh()
    })
  }

  function declare() {
    startTransition(async () => {
      const result = await declarePcPaid(state.token, method, provider)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDeclared(true)
      /* C-33 · as cinco vias acabam todas no mesmo sítio: alguém do nosso lado
         monta o link ou a referência à mão. Prometer "página segura aberta" ou
         "pedido enviado para o seu telefone" era descrever automatismos que não
         existem. */
      toast(t("pc.pay.detailsComing"))
      router.refresh()
    })
  }

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">{t("pc.pay.eyebrow")}</span>
        <h1>
          <Sentence text={t("pc.pay.heading")} />
        </h1>
        <p>{t("pc.pay.intro")}</p>
      </section>

      <PickedOption state={state} />

      {rejected && payment.proof_rejected_reason && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span className="ic">!</span>
          <div>
            <b>{t("pc.pay.proofRejected")}</b>
            <p>
              {t("pc.pay.proofRejectedNote", {
                reason: payment.proof_rejected_reason,
              })}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="sechead">
          <h3>{t("pc.pay.howToPay")}</h3>
          <span className="rt">
            {countryName(country, state.contact.locale)} · {currency}
          </span>
        </div>
        {/* C-33 · a lista deixou de depender do país, e a frase que dizia o
            contrário saiu com ela. O que o cliente precisa de saber agora é
            outra coisa: que alguém prepara isto à mão, e por isso não é
            instantâneo. */}
        <p className="mnote">{t("pc.pay.chooseNote")}</p>

        <div className="mlist">
          {methods.map((entry) => (
            <div className={`m${entry.id === method ? " on" : ""}`} key={entry.id}>
              <button className="m-h" type="button" onClick={() => pickMethod(entry.id)}>
                <span className="rd" />
                <span className="ic2">
                  <MethodIcon kind={entry.id} />
                </span>
                {/* T-08 · o cartão do método também é texto que o cliente lê.
                    `entry.t` e `entry.s` continuam no catálogo como o inglês
                    de recurso; o que vai para o ecrã vem do dicionário. */}
                <span className="ttl">
                  <b>{t(`pc.pay.method.${entry.id}.title`)}</b>
                  <span>{t(`pc.pay.method.${entry.id}.sub`)}</span>
                </span>
                {/* C-33 · o selo de "Instant" / "No fees" saiu. Nenhuma das
                    cinco vias é instantânea do ponto de vista do cliente: o
                    link é criado por uma pessoa, e prometer o contrário era
                    prometer o que o back-office não pode cumprir. */}
              </button>
              <div className="m-b">
                {entry.id === method && (
                  <MethodBody
                    method={entry}
                    payment={payment}
                    total={total}
                    currency={currency}
                    reference={state.request.reference}
                    declared={declared}
                    onDeclare={declare}
                    pending={pending}
                    file={file}
                    dragging={dragging}
                    fileInput={fileInput}
                    onDragging={setDragging}
                    onFile={takeFile}
                    onRemoveFile={() => setFile(null)}
                    onSendProof={sendProof}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <span className="err" style={{ marginTop: 10, display: "block" }}>
            {error}
          </span>
        )}
      </div>

      <div className="card">
        <div className="sechead">
          <h3>{t("pc.pay.whatNext")}</h3>
        </div>
        <div className="sumrows">
          <Rows
            rows={[
              [t("pc.pay.amount"), money(total, currency)],
              [t("pc.pay.quoteReference"), state.request.reference],
              [
                t("pc.pay.weCheck"),
                t("pc.pay.weCheckValue", { hours: PROOF_REVIEW_HOURS }),
              ],
              [t("pc.pay.then"), t("pc.pay.thenValue")],
            ]}
          />
        </div>
        <p className="notice" style={{ marginTop: 12 }}>
          <Sentence
            as="b"
            text={t("pc.pay.onlyPerson", { hours: PROOF_REVIEW_HOURS })}
          />
        </p>
      </div>

      {/*
        C-33 · o botão do comprovativo saiu daqui.

        Estava neste nível e só para a transferência bancária, que era a única
        via que pedia prova. Agora as cinco pedem — nenhuma nos avisa sozinha de
        que o dinheiro entrou — e o botão vive dentro do bloco da via escolhida,
        a seguir ao link ou à referência que o cliente acabou de usar. É onde ele
        está a olhar quando acaba de pagar.
      */}

      {/* Corrigir um nome antes de pagar custa nada; depois de emitir custa um
          bilhete novo. Por isso o caminho de volta está aqui, à vista. */}
      <div className="card tight" style={{ marginTop: 12 }}>
        <a
          className="btn btn-ghost btn-sm"
          style={{ width: "100%" }}
          href={`/pc/${state.token}?view=p7`}
        >
          {t("pc.pay.checkPassengers")}
        </a>
      </div>

      {/*
        T-18 · escrever-nos, e ficar escrito no caso.

        O WhatsApp continua aqui — quem precisa de ajuda precisa dela em
        qualquer uma das cinco vias — mas tem um defeito que só se nota do outro
        lado: a mensagem chega a um telemóvel e não chega ao caso. Este campo
        chega. "Paguei pelo Revolut da minha irmã, o nome no comprovativo não é
        o meu" é a frase que evita uma hora de investigação, e tem de estar no
        sítio onde essa investigação começa.
      */}
      <MessageToWeefly token={state.token} />

      <div className="card tight" style={{ marginTop: 12 }}>
        <WaButton reference={state.request.reference}>
          <IcWa />
          {t("pc.pay.needHelp")}
        </WaButton>
        <p className="subnote">{t("pc.pay.needHelpNote")}</p>
      </div>
      <div className="spacer" />
    </main>
  )
}

// ── T-18 · a mensagem à WeeFly ───────────────────────────────────────────────

/**
 * Um campo, um botão, e uma confirmação que não desaparece.
 *
 * A confirmação fica no lugar do formulário em vez de ser um toast: um toast
 * some ao fim de dois segundos e quem escreveu uma frase importante quer ver
 * que ela ficou. O botão "write another" está lá para quem se lembrou de mais
 * uma coisa.
 */
function MessageToWeefly({ token }: { token: string }) {
  const t = useT()
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function send() {
    setError(null)
    startTransition(async () => {
      const result = await sendPcMessage(token, message)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSent(true)
      setMessage("")
    })
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="sechead">
        <h3>{t("pc.pay.messageHeading")}</h3>
      </div>

      {sent ? (
        <>
          <div className="mdone">✓ {t("pc.pay.messageSent")}</div>
          <div className="mrow">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setSent(false)}
            >
              {t("pc.pay.messageAnother")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mnote">{t("pc.pay.messageNote")}</p>
          <textarea
            className="ta"
            rows={3}
            maxLength={2000}
            placeholder={t("pc.pay.messagePlaceholder")}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          {error && (
            <span className="err" style={{ display: "block", marginTop: 8 }}>
              {error}
            </span>
          )}
          <div className="mrow">
            <button
              className="btn btn-sm"
              type="button"
              disabled={pending || message.trim().length < 2}
              onClick={send}
            >
              {pending ? t("pc.pay.sending") : t("pc.pay.messageSend")}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── o corpo de cada método ───────────────────────────────────────────────────

/**
 * C-33 · o que o cliente vê depois de escolher a via.
 *
 * Este componente tinha um bloco por família de pagamento: coordenadas
 * bancárias para a transferência, fichas de provedor para os links, o endereço
 * do escritório para quem pagava ao balcão. Fazia sentido enquanto a plataforma
 * dizia ao cliente como pagar.
 *
 * A premissa mudou — "o pagamento acontece fora da plataforma, a validação
 * acontece dentro dela" — e com ela este ecrã. Há dois estados, e só dois:
 *
 *   · **o agente ainda não forneceu nada.** Diz-se isso, e diz-se quando
 *     chega. Não se inventa um IBAN nem se promete um link que não existe;
 *   · **já forneceu.** Aparece o link ou a referência que ele arranjou, com
 *     um botão para copiar, o valor a pagar e o prazo. E, por baixo, o envio
 *     do comprovativo — que é o único gesto que fecha o lado do cliente.
 *
 * A transferência bancária saiu, e com ela o IBAN, o beneficiário e o endereço
 * do escritório. Decisão confirmada do backlog: "No bank transfer option —
 * removed from this phase."
 */
function MethodBody({
  method,
  payment,
  total,
  currency,
  reference,
  declared,
  onDeclare,
  pending,
  file,
  dragging,
  fileInput,
  onDragging,
  onFile,
  onRemoveFile,
  onSendProof,
}: {
  method: PayMethod
  payment: PcPayment
  total: number
  currency: string
  reference: string
  declared: boolean
  onDeclare: () => void
  pending: boolean
  file: File | null
  dragging: boolean
  fileInput: React.RefObject<HTMLInputElement>
  onDragging: (value: boolean) => void
  onFile: (file: File | null | undefined) => void
  onRemoveFile: () => void
  onSendProof: () => void
}) {
  const { locale, t } = useI18n()
  /* As instruções só valem para a via que o agente tinha em mãos quando as
     escreveu. Se o cliente mudar de via depois disso, o que está gravado é de
     outra coisa e não se mostra — pedem-se de novo. */
  const forThisMethod = payment.method === method.id
  const link = forThisMethod ? payment.pay_link : null
  const ref = forThisMethod ? payment.pay_reference : null
  const has = Boolean(link || ref)

  /* T-08 · o nome do método na língua de quem lê. "Vinti4 / 24" é um nome
     próprio e não se traduz; o que muda é a frase à volta dele. */
  const methodName = methodLabel(method.id, locale)

  const due = payment.pay_due_at
    ? new Date(payment.pay_due_at).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  if (!has) {
    return (
      <>
        <div className="srow" style={{ borderTop: "1px solid var(--line-soft)" }}>
          <span className="k">{t("pc.pay.amount")}</span>
          <span className="v mono">{money(total, currency)}</span>
        </div>
        <div className="srow">
          <span className="k">{t("pc.pay.quoteReference")}</span>
          <span className="v mono">{reference}</span>
        </div>
        <div className="mrow">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={pending}
            onClick={onDeclare}
          >
            {t("pc.pay.sendMeDetails", { method: methodName })}
          </button>
        </div>
        {declared && (
          <div className="mdone">
            ✓ {t("pc.pay.preparingDetails", { method: methodName })}
          </div>
        )}
        <p className="mfoot">{t("pc.pay.byHand")}</p>
      </>
    )
  }

  return (
    <>
      <div className="srow" style={{ borderTop: "1px solid var(--line-soft)" }}>
        <span className="k">{t("pc.pay.amountToPay")}</span>
        <span className="v mono">{money(total, currency)}</span>
      </div>

      {link && (
        <div className="srow">
          <span className="k">{t("pc.pay.openLink")}</span>
          <span className="v" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="mono"
              style={{ wordBreak: "break-all" }}
            >
              {link}
            </a>
            <CopyButton value={link} label={t("pc.pay.copyLink")} />
          </span>
        </div>
      )}

      {ref && (
        <div className="srow">
          <span className="k">{t("pc.pay.referenceToPay")}</span>
          <span className="v" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <b className="mono">{ref}</b>
            <CopyButton value={ref} label={t("pc.pay.copyReference")} />
          </span>
        </div>
      )}

      <div className="srow">
        <span className="k">{t("pc.pay.quoteOurReference")}</span>
        <span className="v mono">{reference}</span>
      </div>

      {due && (
        <div className="srow">
          <span className="k">{t("pc.pay.payBy")}</span>
          <span className="v">{due}</span>
        </div>
      )}

      {/*
        O comprovativo. É o único gesto que fecha o lado do cliente, e por isso
        está sempre aqui — qualquer das cinco vias acaba com alguém a ter de
        provar que pagou, porque nenhuma delas nos avisa sozinha.
      */}
      <div
        className={`drop${dragging ? " on" : ""}`}
        onDragOver={(event) => {
          event.preventDefault()
          onDragging(true)
        }}
        onDragLeave={() => onDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          onDragging(false)
          onFile(event.dataTransfer.files?.[0])
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") fileInput.current?.click()
        }}
        style={{ marginTop: 12 }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          hidden
          onChange={(event) => onFile(event.target.files?.[0])}
        />
        {file ? (
          <div className="dfile">
            <IcFile />
            <span className="mono">{file.name}</span>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRemoveFile()
              }}
            >
              {t("pc.pay.remove")}
            </button>
          </div>
        ) : (
          <>
            <IcFile />
            <b>{t("pc.pay.sendProof")}</b>
            <span>{t("pc.pay.proofTypes")}</span>
          </>
        )}
      </div>

      <div className="mrow">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={pending || !file}
          onClick={onSendProof}
        >
          {pending ? t("pc.pay.sending") : t("pc.pay.paidSendProof")}
        </button>
      </div>

      <p className="mfoot">
        {t("pc.pay.confirmedByPerson", { hours: PROOF_REVIEW_HOURS })}
      </p>
    </>
  )
}
