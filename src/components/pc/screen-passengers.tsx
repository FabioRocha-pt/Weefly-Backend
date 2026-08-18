"use client"

/**
 * WeeFly Price Checker — P7, os passaportes.
 *
 * No mockup os passaportes e o pagamento eram um ecrã só. Aqui são dois, e por
 * uma razão prática: o nome no passaporte é o que se corrige depois com um
 * bilhete novo pago ao preço da companhia, e a atenção de quem preenche não
 * chega para as duas coisas ao mesmo tempo. Primeiro os nomes, depois o
 * dinheiro.
 *
 * A validação é a do mockup, campo a campo, com as mesmas mensagens — e o
 * servidor repete-a (ver `passengerSchema`).
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { savePcPassengers } from "@/actions/pc"
import type { PcState } from "@/lib/pc/state"
import { NATIONALITIES } from "@/lib/pc/catalog"
import {
  addMonths,
  ageAt,
  fmtDateY,
  paxShort,
  todayISO,
} from "@/lib/pc/format"
import { PickedOption } from "@/components/pc/picked-option"
import { useToast } from "@/components/pc/chrome"

type Kind = "adult" | "child" | "infant_seat" | "infant_lap"

interface PaxRow {
  kind: Kind
  title: string
  given: string
  surname: string
  dob: string
  sex: string
  nationality: string
  passportNumber: string
  passportExpiry: string
  issuingCountry: string
}

const KIND_TITLE: Record<Kind, string> = {
  adult: "Adult",
  child: "Child",
  infant_seat: "Infant",
  infant_lap: "Infant",
}

function kindSub(kind: Kind, lead: boolean): string {
  if (kind === "child") return "Aged 2 to 11 · must travel accompanied"
  if (kind === "infant_lap") return "Under 2 · on an adult's lap"
  if (kind === "infant_seat") return "Under 2 · with own seat"
  return lead ? "Lead passenger · receives all messages" : "Adult passenger"
}

/** Quem viaja, na ordem em que o pedido os declarou. */
function seatKinds(request: PcState["request"]): Kind[] {
  const kinds: Kind[] = []
  for (let i = 0; i < request.adults; i++) kinds.push("adult")
  for (let i = 0; i < request.children; i++) kinds.push("child")
  for (let i = 0; i < request.infantsInSeat; i++) kinds.push("infant_seat")
  for (let i = 0; i < request.infantsOnLap; i++) kinds.push("infant_lap")
  return kinds
}

const SEX_LABEL: Record<string, string> = { f: "Female", m: "Male" }
const TITLE_LABEL: Record<string, string> = { mr: "Mr", mrs: "Mrs", ms: "Ms" }

export function ScreenP7({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const kinds = useMemo(() => seatKinds(state.request), [state.request])

  /* Já preenchido? Recomeça do que está guardado. O primeiro passageiro nasce
     com o nome de quem submeteu o pedido — é a pessoa que está a preencher. */
  const [rows, setRows] = useState<PaxRow[]>(() =>
    kinds.map((kind, index) => {
      const saved = state.passengers.find((p) => p.position === index + 1)
      if (saved) {
        return {
          kind,
          title: saved.title ?? "",
          given: saved.first_name ?? "",
          surname: saved.last_name ?? "",
          dob: saved.birth_date ?? "",
          sex: saved.gender ?? "",
          nationality: saved.nationality ?? "",
          passportNumber: saved.passport_number ?? "",
          passportExpiry: saved.passport_expiry ?? "",
          issuingCountry: saved.issuing_country ?? "",
        }
      }
      const blank: PaxRow = {
        kind,
        title: "",
        given: "",
        surname: "",
        dob: "",
        sex: "",
        nationality: "",
        passportNumber: "",
        passportExpiry: "",
        issuingCountry: "",
      }
      if (index === 0 && state.contact.fullName) {
        const parts = state.contact.fullName.trim().split(/\s+/)
        blank.surname = parts.length > 1 ? parts[parts.length - 1] : ""
        blank.given = parts.slice(0, Math.max(1, parts.length - 1)).join(" ")
      }
      return blank
    })
  )

  const [ack, setAck] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const travelDate =
    state.request.trip === "multi"
      ? (state.request.legs[0]?.date ?? todayISO())
      : state.request.departDate || todayISO()

  const lastDate =
    state.request.trip === "multi"
      ? (state.request.legs[state.request.legs.length - 1]?.date ?? travelDate)
      : state.request.trip === "round"
        ? (state.request.returnDate ?? travelDate)
        : travelDate

  const errorsFor = (row: PaxRow): Record<string, string> => {
    const e: Record<string, string> = {}

    if (row.kind === "adult" && !row.title) e.title = "Required"
    if (row.given.trim().length < 2) e.given = "As in the passport"
    if (row.surname.trim().length < 2) e.surname = "As in the passport"

    if (!row.dob) e.dob = "Required"
    else {
      const age = ageAt(row.dob, travelDate)
      if (age === null || age < 0) e.dob = "Check this date"
      else if (row.kind === "adult" && age < 12)
        e.dob = "An adult is 12 or over on the travel date"
      else if (row.kind === "child" && (age < 2 || age > 11))
        e.dob = "A child is 2 to 11 on the travel date"
      else if (row.kind !== "adult" && row.kind !== "child" && age >= 2)
        e.dob = "An infant is under 2 on the travel date"
    }

    if (!row.sex) e.sex = "Required"
    if (!row.nationality) e.nationality = "Required"
    if (!/^[A-Za-z0-9]{5,12}$/.test(row.passportNumber.trim()))
      e.passportNumber = "5 to 12 letters or digits"

    if (!row.passportExpiry) e.passportExpiry = "Required"
    else {
      const need = addMonths(lastDate, 6)
      if (row.passportExpiry < lastDate)
        e.passportExpiry = "This passport expires before the trip"
      else if (row.passportExpiry < need)
        e.passportExpiry = `Must be valid until ${fmtDateY(need)}`
    }

    if (!row.issuingCountry) e.issuingCountry = "Required"
    return e
  }

  const allErrors = rows.map(errorsFor)
  const complete = allErrors.every((e) => Object.keys(e).length === 0)

  const patch = (index: number, key: keyof PaxRow, value: string) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    )

  function submit() {
    setShowErrors(true)
    setServerError(null)

    if (!complete || !ack) {
      document
        .querySelector(".ff.bad, .paxcard.bad")
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }

    startTransition(async () => {
      const result = await savePcPassengers(
        state.token,
        rows.map((row, index) => ({
          position: index + 1,
          kind: row.kind,
          title: row.kind === "adult" ? (row.title as "mr" | "mrs" | "ms") : null,
          given: row.given.trim(),
          surname: row.surname.trim(),
          dob: row.dob,
          sex: row.sex as "f" | "m",
          nationality: row.nationality,
          passportNumber: row.passportNumber.trim(),
          passportExpiry: row.passportExpiry,
          issuingCountry: row.issuingCountry,
        }))
      )

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      toast("Passenger details saved")
      /* `replace` e não `refresh`: quem chegou aqui por `?view=p7` (a corrigir um
         nome) tem de sair do parâmetro, ou continuaria a ver o formulário depois
         de o gravar. Sem o parâmetro, o ecrã volta a ser o que o estado manda. */
      router.replace(`/pc/${state.token}`)
      router.refresh()
    })
  }

  return (
    <main className="shell view">
      <section className="hero">
        <span className="eyebrow">Step 5 · passengers</span>
        <h1>
          Who is <em>travelling</em>?
        </h1>
        <p>
          Enter the details exactly as they appear in the passport. The payment
          instructions come on the next screen.
        </p>
      </section>

      <PickedOption state={state} />

      <div className="card">
        <div className="sechead">
          <h3>Passenger details</h3>
          <span className="rt">{paxShort(state.request)} · as in the passport</span>
        </div>
        <p className="notice">
          Write the names exactly as they appear in the passport.{" "}
          <b>
            After issuing, correcting a name requires a brand new ticket at the
            airline&apos;s full cost.
          </b>
        </p>

        <div>
          {rows.map((row, index) => {
            const errors = allErrors[index]
            const bad = showErrors && Object.keys(errors).length > 0
            const done = Object.keys(errors).length === 0
            const isAdult = row.kind === "adult"

            return (
              <div className={`paxcard${bad ? " bad" : ""}`} key={index}>
                <div className="paxcard-h">
                  <span className={`paxtag${isAdult ? "" : " child"}`}>P{index + 1}</span>
                  <div>
                    <b>
                      {KIND_TITLE[row.kind]} {index + 1}
                    </b>
                    <span>{kindSub(row.kind, index === 0)}</span>
                  </div>
                  <span className={`st2${done ? " ok" : ""}`}>
                    {done ? "Complete" : "To fill in"}
                  </span>
                </div>
                <div className="paxcard-b">
                  <div className="pgrid">
                    {isAdult && (
                      <Field
                        cls="c4"
                        label="Title"
                        error={showErrors ? errors.title : undefined}
                      >
                        <select
                          value={row.title}
                          onChange={(event) => patch(index, "title", event.target.value)}
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          {Object.entries(TITLE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    <Field
                      cls={isAdult ? "c8" : "c6"}
                      label="Given names"
                      hint="All of them, in passport order"
                      error={showErrors ? errors.given : undefined}
                    >
                      <input
                        placeholder="As in the passport"
                        value={row.given}
                        onChange={(event) => patch(index, "given", event.target.value)}
                      />
                    </Field>

                    <Field
                      cls="c6"
                      label="Surnames"
                      error={showErrors ? errors.surname : undefined}
                    >
                      <input
                        placeholder="As in the passport"
                        value={row.surname}
                        onChange={(event) => patch(index, "surname", event.target.value)}
                      />
                    </Field>

                    <Field
                      cls="c6"
                      label="Date of birth"
                      hint={
                        row.kind === "child"
                          ? "2 to 11 on the travel date"
                          : row.kind === "adult"
                            ? "12 or over on the travel date"
                            : "Under 2 on the travel date"
                      }
                      error={showErrors ? errors.dob : undefined}
                    >
                      <input
                        type="date"
                        max={travelDate}
                        value={row.dob}
                        onChange={(event) => patch(index, "dob", event.target.value)}
                      />
                    </Field>

                    <Field cls="c6" label="Sex" error={showErrors ? errors.sex : undefined}>
                      <select
                        value={row.sex}
                        onChange={(event) => patch(index, "sex", event.target.value)}
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {Object.entries(SEX_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      cls="c6"
                      label="Nationality"
                      error={showErrors ? errors.nationality : undefined}
                    >
                      <select
                        value={row.nationality}
                        onChange={(event) => patch(index, "nationality", event.target.value)}
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {NATIONALITIES.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      cls="c6"
                      label="Passport number"
                      error={showErrors ? errors.passportNumber : undefined}
                    >
                      <input
                        className="mono"
                        placeholder="e.g. CV1234567"
                        style={{ letterSpacing: ".04em" }}
                        value={row.passportNumber}
                        onChange={(event) =>
                          patch(index, "passportNumber", event.target.value)
                        }
                      />
                    </Field>

                    <Field
                      cls="c6"
                      label="Valid until"
                      hint="6 months beyond the return date"
                      error={showErrors ? errors.passportExpiry : undefined}
                    >
                      <input
                        type="date"
                        min={lastDate}
                        value={row.passportExpiry}
                        onChange={(event) =>
                          patch(index, "passportExpiry", event.target.value)
                        }
                      />
                    </Field>

                    <Field
                      cls="c6"
                      label="Issuing country"
                      error={showErrors ? errors.issuingCountry : undefined}
                    >
                      <select
                        value={row.issuingCountry}
                        onChange={(event) =>
                          patch(index, "issuingCountry", event.target.value)
                        }
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {NATIONALITIES.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {showErrors && !complete && (
          <span className="err" style={{ marginTop: 10, display: "block" }}>
            Complete every passenger before continuing
          </span>
        )}
      </div>

      <label className="consent" htmlFor="ack">
        <input
          type="checkbox"
          id="ack"
          checked={ack}
          onChange={(event) => setAck(event.target.checked)}
        />
        <p>
          <b>I confirm the details above match the passports</b> and that the
          passports are valid for at least 6 months beyond the return date. I
          understand that entry to some countries requires a visa or electronic
          authorisation.
        </p>
      </label>
      {showErrors && !ack && (
        <span className="err" style={{ marginTop: 8, display: "block" }}>
          Please confirm this before we issue
        </span>
      )}

      {serverError && (
        <span className="err" style={{ marginTop: 10, display: "block" }}>
          {serverError}
        </span>
      )}

      <div className="card tight" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="button" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Continue to payment"}
        </button>
        <p className="subnote">
          Nothing is charged yet. The next screen has the payment instructions.
        </p>
      </div>
      <div className="spacer" />
    </main>
  )
}

function Field({
  cls,
  label,
  hint,
  error,
  children,
}: {
  cls: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className={`ff ${cls}${error ? " bad" : ""}`}>
      <label>
        {label}
        <span className="req">*</span>
      </label>
      {children}
      {hint && <span className="hi">{hint}</span>}
      <span className="ferr">{error ?? ""}</span>
    </div>
  )
}
