"use client"

/**
 * WeeFly Price Checker — o ecrã de pagamento.
 *
 * Seis métodos, ordenados pelo que se usa no país do cliente, e um deles pede
 * comprovativo. É esse — a transferência — que o resto do sistema foi construído
 * para servir: o ficheiro sobe para um bucket privado, a equipa abre-o, compara
 * o valor e marca a caixa. Até essa caixa ser marcada, nada está pago.
 *
 * O que este ecrã promete ao cliente é exatamente o que o back-office pode
 * cumprir: verificamos em horário de expediente, e há um prazo. Se o prazo
 * passar sem confirmação, o link expira e ele vê o ecrã P8 — não uma página
 * pendurada para sempre.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { declarePcPaid, setPcPayMethod, uploadPcProof } from "@/actions/pc"
import type { PcState } from "@/lib/pc/state"
import {
  BANK_DETAILS,
  BENEFICIARY,
  COUNTRY,
  OFFICE_ADDRESS,
  OFFICE_HOURS,
  PROOF_MAX_BYTES,
  PROOF_REVIEW_HOURS,
  countryOfDialCode,
  methodsFor,
  providersFor,
  type PayMethod,
  type PayMethodId,
} from "@/lib/pc/catalog"
import { money, phoneDisplay } from "@/lib/pc/format"
import { IcFile, IcWa, MethodIcon, Rows } from "@/components/pc/bits"
import { CopyButton, WaButton, useToast } from "@/components/pc/chrome"
import { PickedOption } from "@/components/pc/picked-option"

export function ScreenP7Pay({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const payment = state.payment
  const country = countryOfDialCode(state.contact.dialCode)
  const methods = useMemo(() => methodsFor(country), [country])

  const [method, setMethod] = useState<PayMethodId>(
    (payment?.method as PayMethodId) ?? methods[0].id
  )
  const [provider, setProvider] = useState<string | null>(payment?.pay_provider ?? null)
  const [declared, setDeclared] = useState(Boolean(payment?.client_declared_paid_at))
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  if (!payment) return null

  const total = payment.amount
  const currency = payment.currency
  const phone = phoneDisplay(state.contact.dialCode, state.contact.phone)
  const bank = country === "CV" ? BANK_DETAILS.CV : BANK_DETAILS.PT
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

  function pickProvider(next: string) {
    setProvider(next)
    void setPcPayMethod(state.token, method, next)
  }

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
      toast(
        method === "card"
          ? "Secure payment page opened"
          : method === "link"
            ? "Payment link on its way"
            : method === "momo"
              ? "Payment request sent to your phone"
              : method === "cash"
                ? "We will hold the fare for you"
                : "Thanks — we are watching for it"
      )
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
            {COUNTRY[country] ?? country} · {currency}
          </span>
        </div>
        <p className="mnote">
          These are the methods available for <b>{COUNTRY[country] ?? country}</b>. We
          accept most local payment methods around the world — if you don&apos;t see
          yours, tell us on WhatsApp and we&apos;ll arrange it.
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
                <span className={`bg${entry.free ? " free" : ""}`}>{entry.bg}</span>
              </button>
              <div className="m-b">
                {entry.id === method && (
                  <MethodBody
                    method={entry}
                    country={country}
                    provider={provider}
                    onProvider={pickProvider}
                    total={total}
                    currency={currency}
                    reference={state.request.reference}
                    bank={bank}
                    phone={phone}
                    email={state.contact.email}
                    declared={declared}
                    onDeclare={declare}
                    pending={pending}
                    file={file}
                    dragging={dragging}
                    fileInput={fileInput}
                    onDragging={setDragging}
                    onFile={takeFile}
                    onRemoveFile={() => setFile(null)}
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

      {method === "transfer" && (
        <div className="card tight" style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending}
            onClick={sendProof}
          >
            {pending ? "Sending…" : "I have paid · send the proof"}
          </button>
          <p className="subnote">
            We check payments during business hours, usually within 2 hours.
          </p>
          <div style={{ marginTop: 12 }}>
            <WaButton
              reference={state.request.reference}
              className="btn btn-ghost btn-sm"
              style={{ width: "100%" }}
            >
              I need help with the payment
            </WaButton>
          </div>
        </div>
      )}

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

      {method !== "transfer" && (
        <div className="card tight" style={{ marginTop: 12 }}>
          <WaButton reference={state.request.reference}>
            <IcWa />
            I need help with the payment
          </WaButton>
          <p className="subnote">
            Prefer to send a receipt? Choose <b>Bank transfer</b> above and attach
            it.
          </p>
        </div>
      )}
      <div className="spacer" />
    </main>
  )
}

// ── o corpo de cada método ───────────────────────────────────────────────────

function MethodBody({
  method,
  country,
  provider,
  onProvider,
  total,
  currency,
  reference,
  bank,
  phone,
  email,
  declared,
  onDeclare,
  pending,
  file,
  dragging,
  fileInput,
  onDragging,
  onFile,
  onRemoveFile,
}: {
  method: PayMethod
  country: string
  provider: string | null
  onProvider: (value: string) => void
  total: number
  currency: string
  reference: string
  bank: { bank: string; iban: string; ibanFlat: string }
  phone: string
  email: string
  declared: boolean
  onDeclare: () => void
  pending: boolean
  file: File | null
  dragging: boolean
  fileInput: React.RefObject<HTMLInputElement>
  onDragging: (value: boolean) => void
  onFile: (file: File | null | undefined) => void
  onRemoveFile: () => void
}) {
  const providers = providersFor(method.id, country)
  const selected = provider ?? providers?.[0] ?? ""

  const chips = providers ? (
    <div className="chips">
      {providers.map((name) => (
        <button
          key={name}
          className="chip"
          type="button"
          aria-pressed={name === selected}
          onClick={() => onProvider(name)}
        >
          {name}
        </button>
      ))}
    </div>
  ) : null

  if (method.id === "transfer") {
    return (
      <>
        <div className="bank">
          <div className="bk wide">
            <span>Beneficiary</span>
            <b>{BENEFICIARY}</b>
          </div>
          <div className="bk">
            <span>Bank</span>
            <b>{bank.bank}</b>
          </div>
          <div className="bk">
            <span>Currency</span>
            <b>{currency}</b>
          </div>
          <div className="bk wide">
            <CopyButton value={bank.ibanFlat} className="cpy" label="Copy" />
            <span>IBAN</span>
            <b className="mono">{bank.iban}</b>
          </div>
          <div className="bk">
            <span>Exact amount</span>
            <b className="mono">{money(total, currency)}</b>
          </div>
          <div className="bk" style={{ background: "var(--warn-tint)" }}>
            <CopyButton value={reference} className="cpy" label="Copy" />
            <span>Required description</span>
            <b className="mono">{reference}</b>
          </div>
        </div>

        <p
          className="notice"
          style={{ marginTop: 11, background: "var(--warn-tint)", color: "#6B4405" }}
        >
          Write the reference <b className="mono">{reference}</b> in the transfer
          description. Without it we can&apos;t match your payment to this booking.
        </p>

        <button
          type="button"
          className={`drop${dragging ? " over" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            onDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            onDragging(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            onDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            onDragging(false)
            onFile(event.dataTransfer.files?.[0])
          }}
        >
          <b>Upload proof of payment</b>
          <p>Tap to choose from your device · JPG, PNG or PDF up to 8 MB</p>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          hidden
          onChange={(event) => onFile(event.target.files?.[0])}
        />

        {file && (
          <div className="file">
            <IcFile />
            <span className="nm">{file.name}</span>
            <span className="sz">
              {file.size > 1048576
                ? `${(file.size / 1048576).toFixed(1)} MB`
                : `${Math.max(1, Math.round(file.size / 1024))} KB`}
            </span>
            <button type="button" className="rmf" onClick={onRemoveFile}>
              Remove
            </button>
          </div>
        )}
      </>
    )
  }

  if (method.id === "link") {
    return (
      <>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--navy-soft)" }}>
          We send you a secure payment link. Choose the service you already use:
        </p>
        {chips}
        <div className="mrow">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={pending}
            onClick={onDeclare}
          >
            Send me the payment link
          </button>
        </div>
        {declared && (
          <div className="mdone">
            ✓ Request received · we send the link to {phone} and to {email}
          </div>
        )}
        <p className="mfoot">
          The link arrives on WhatsApp at <b className="mono">{phone}</b> and by
          email, usually within a few minutes. It is valid for 24 hours and can only
          be used once.
        </p>
      </>
    )
  }

  if (method.id === "card") {
    return (
      <>
        <p style={{ margin: "0 0 11px", fontSize: 13.5, color: "var(--navy-soft)" }}>
          Opens our payment provider&apos;s secure page, outside WeeFly.{" "}
          <b>We never see or store your card details.</b>
        </p>
        <div className="srow" style={{ borderTop: "1px solid var(--line-soft)" }}>
          <span className="k">Amount</span>
          <span className="v mono">{money(total, currency)}</span>
        </div>
        <div className="srow">
          <span className="k">Card fee</span>
          <span className="v">None</span>
        </div>
        <div className="mrow">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={pending}
            onClick={onDeclare}
          >
            Ask for the secure payment page
          </button>
        </div>
        {declared && (
          <div className="mdone">
            ✓ We are preparing your payment page · we message you the link
          </div>
        )}
        <p className="mfoot">
          Your agent sends the secure link on WhatsApp. Come back here once the
          payment is complete.
        </p>
      </>
    )
  }

  if (method.id === "momo") {
    return (
      <>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--navy-soft)" }}>
          Choose your provider and we send a payment request to your phone:
        </p>
        {chips}
        <div className="pgrid" style={{ marginTop: 12 }}>
          <div className="ff c12">
            <label>Mobile money number</label>
            <input className="mono" defaultValue={phone} readOnly />
          </div>
        </div>
        <div className="mrow">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={pending}
            onClick={onDeclare}
          >
            Send payment request
          </button>
        </div>
        {declared && (
          <div className="mdone">✓ Request noted · we send it to your phone</div>
        )}
        <p className="mfoot">
          You will receive a prompt on your phone. Approve it with your PIN.
          Availability depends on your country and provider.
        </p>
      </>
    )
  }

  if (method.id === "local") {
    return (
      <>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--navy-soft)" }}>
          Pay the way you normally do at home. Tell us which method and we send you
          the reference:
        </p>
        {chips}
        <div className="mrow">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={pending}
            onClick={onDeclare}
          >
            Send me the reference
          </button>
        </div>
        {declared && (
          <div className="mdone">
            ✓ We send the entity and reference to {phone}
          </div>
        )}
        <p className="mfoot">
          The reference is generated by our provider for the method you chose and is
          valid for 48 hours.
        </p>
      </>
    )
  }

  return (
    <>
      <div className="srow" style={{ borderTop: "1px solid var(--line-soft)" }}>
        <span className="k">Address</span>
        <span className="v">{OFFICE_ADDRESS}</span>
      </div>
      <div className="srow">
        <span className="k">Opening hours</span>
        <span className="v">{OFFICE_HOURS}</span>
      </div>
      <div className="srow">
        <span className="k">Bring</span>
        <span className="v">
          Your reference <span className="mono">{reference}</span>
        </span>
      </div>
      <div className="mrow">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={pending}
          onClick={onDeclare}
        >
          I will come to the office
        </button>
      </div>
      {declared && <div className="mdone">✓ We will hold the fare until you arrive</div>}
      <p className="mfoot">
        Tell us when you plan to come so we can hold the fare until then.
      </p>
    </>
  )
}
