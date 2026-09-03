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

import { declarePcPaid, setPcPayMethod, uploadPcProof } from "@/actions/pc"
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
import { IcFile, IcWa, MethodIcon, Rows } from "@/components/pc/bits"
import { CopyButton, WaButton, useToast } from "@/components/pc/chrome"
import { PickedOption } from "@/components/pc/picked-option"

export function ScreenP7Pay({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
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
          <h2>Almost there</h2>
          <p className="mnote" style={{ marginTop: 8 }}>
            We are preparing the payment details for your trip. Refresh this page
            in a moment — if it stays like this, message us on WhatsApp and we
            will send the instructions by hand.
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
      setError("That file is over 8 MB")
      return
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(candidate.type)) {
      setError("Send a JPG, a PNG or a PDF")
      return
    }
    setError(null)
    setFile(candidate)
  }

  function sendProof() {
    if (!file) {
      setError("Attach the proof of your transfer so we can match the payment")
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
      toast("Proof received — we are checking it")
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
      toast("Thanks — we are preparing your payment details")
      router.refresh()
    })
  }

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">Step 6 · last one</span>
        <h1>
          How would you like <em>to pay</em>?
        </h1>
        <p>
          Passenger details are saved. Pay by the method that suits you and send us
          the proof — we issue the tickets once the payment is confirmed.
        </p>
      </section>

      <PickedOption state={state} />

      {rejected && payment.proof_rejected_reason && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span className="ic">!</span>
          <div>
            <b>We could not match your last proof</b>
            <p>{payment.proof_rejected_reason} — please send another one.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="sechead">
          <h3>How would you like to pay?</h3>
          <span className="rt">
            {countryName(country, state.contact.locale)} · {currency}
          </span>
        </div>
        {/* C-33 · a lista deixou de depender do país, e a frase que dizia o
            contrário saiu com ela. O que o cliente precisa de saber agora é
            outra coisa: que alguém prepara isto à mão, e por isso não é
            instantâneo. */}
        <p className="mnote">
          Choose how you would like to pay and we will send you the link or the
          reference for that method. One of us prepares it by hand — if you
          don&apos;t see the method you want, tell us on WhatsApp and we&apos;ll
          arrange it.
        </p>

        <div className="mlist">
          {methods.map((entry) => (
            <div className={`m${entry.id === method ? " on" : ""}`} key={entry.id}>
              <button className="m-h" type="button" onClick={() => pickMethod(entry.id)}>
                <span className="rd" />
                <span className="ic2">
                  <MethodIcon kind={entry.id} />
                </span>
                <span className="ttl">
                  <b>{entry.t}</b>
                  <span>{entry.s}</span>
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
          <h3>What happens next</h3>
        </div>
        <div className="sumrows">
          <Rows
            rows={[
              ["Amount", money(total, currency)],
              ["Reference to quote", state.request.reference],
              ["We check it", `In business hours, within ${PROOF_REVIEW_HOURS} h`],
              ["Then", "Tickets by email and in this link"],
            ]}
          />
        </div>
        <p className="notice" style={{ marginTop: 12 }}>
          A payment is only confirmed by a person on our side, after seeing it in
          the account. <b>Until then the price is held, not charged</b> — and if we
          do not confirm within {PROOF_REVIEW_HOURS} hours the window closes and we
          quote you again.
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
          Check the passenger details again
        </a>
      </div>

      {/* O WhatsApp deixa de estar condicionado à via: quem precisa de ajuda
          precisa dela em qualquer uma das cinco. A frase que mandava escolher
          "Bank transfer" para anexar um recibo saiu com a transferência. */}
      <div className="card tight" style={{ marginTop: 12 }}>
        <WaButton reference={state.request.reference}>
          <IcWa />
          I need help with the payment
        </WaButton>
        <p className="subnote">
          One of us sets up the payment details by hand — if anything looks wrong,
          tell us here before you pay.
        </p>
      </div>
      <div className="spacer" />
    </main>
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
  /* As instruções só valem para a via que o agente tinha em mãos quando as
     escreveu. Se o cliente mudar de via depois disso, o que está gravado é de
     outra coisa e não se mostra — pedem-se de novo. */
  const forThisMethod = payment.method === method.id
  const link = forThisMethod ? payment.pay_link : null
  const ref = forThisMethod ? payment.pay_reference : null
  const has = Boolean(link || ref)

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
          <span className="k">Amount</span>
          <span className="v mono">{money(total, currency)}</span>
        </div>
        <div className="srow">
          <span className="k">Reference to quote</span>
          <span className="v mono">{reference}</span>
        </div>
        <div className="mrow">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={pending}
            onClick={onDeclare}
          >
            Send me the {method.t} details
          </button>
        </div>
        {declared && (
          <div className="mdone">
            ✓ We are preparing your {method.t} details and will send them here
          </div>
        )}
        <p className="mfoot">
          One of us sets this up by hand, so it is not instant. You will get the
          details by email and in this link — usually within business hours.
        </p>
      </>
    )
  }

  return (
    <>
      <div className="srow" style={{ borderTop: "1px solid var(--line-soft)" }}>
        <span className="k">Amount to pay</span>
        <span className="v mono">{money(total, currency)}</span>
      </div>

      {link && (
        <div className="srow">
          <span className="k">Payment link</span>
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
            <CopyButton value={link} label="Copy link" />
          </span>
        </div>
      )}

      {ref && (
        <div className="srow">
          <span className="k">Reference to pay</span>
          <span className="v" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <b className="mono">{ref}</b>
            <CopyButton value={ref} label="Copy reference" />
          </span>
        </div>
      )}

      <div className="srow">
        <span className="k">Quote our reference</span>
        <span className="v mono">{reference}</span>
      </div>

      {due && (
        <div className="srow">
          <span className="k">Please pay by</span>
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
              Remove
            </button>
          </div>
        ) : (
          <>
            <IcFile />
            <b>Send the proof of your payment</b>
            <span>JPG, PNG or PDF · up to 8 MB</span>
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
          {pending ? "Sending…" : "I have paid · send the proof"}
        </button>
      </div>

      <p className="mfoot">
        A payment is only confirmed by a person on our side, after seeing it in
        the account. We check within {PROOF_REVIEW_HOURS} hours in business hours.
      </p>
    </>
  )
}
