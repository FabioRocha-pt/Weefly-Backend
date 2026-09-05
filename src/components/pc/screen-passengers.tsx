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
import { useT } from "@/i18n/provider"
import type { Translator } from "@/i18n/translate"

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

const KIND_KEY: Record<Kind, string> = {
  adult: "pc.pax.kind.adult",
  child: "pc.pax.kind.child",
  infant_seat: "pc.pax.kind.infant",
  infant_lap: "pc.pax.kind.infant",
}

function kindSub(kind: Kind, lead: boolean, t: Translator): string {
  if (kind === "child") return t("pc.pax.sub.child")
  if (kind === "infant_lap") return t("pc.pax.sub.infantLap")
  if (kind === "infant_seat") return t("pc.pax.sub.infantSeat")
  return t(lead ? "pc.pax.sub.lead" : "pc.pax.sub.adult")
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

const SEX_KEY: Record<string, string> = { f: "pc.pax.sex.f", m: "pc.pax.sex.m" }
/* Os tratamentos ficam nas abreviaturas internacionais: e o que vai no
   bilhete e o que a companhia aceita. */
const TITLE_LABEL: Record<string, string> = { mr: "Mr", mrs: "Mrs", ms: "Ms" }

export function ScreenP7({ state }: { state: PcState }) {
  const router = useRouter()
  const toast = useToast()
  const t = useT()
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

    if (row.kind === "adult" && !row.title) e.title = t("pc.pax.error.required")
    if (row.given.trim().length < 2) e.given = t("pc.pax.error.asInPassport")
    if (row.surname.trim().length < 2) e.surname = t("pc.pax.error.asInPassport")

    if (!row.dob) e.dob = t("pc.pax.error.required")
    else {
      const age = ageAt(row.dob, travelDate)
      if (age === null || age < 0) e.dob = t("pc.pax.error.checkDate")
      else if (row.kind === "adult" && age < 12)
        e.dob = t("pc.pax.error.adultAge")
      else if (row.kind === "child" && (age < 2 || age > 11))
        e.dob = t("pc.pax.error.childAge")
      else if (row.kind !== "adult" && row.kind !== "child" && age >= 2)
        e.dob = t("pc.pax.error.infantAge")
    }

    if (!row.sex) e.sex = t("pc.pax.error.required")
    if (!row.nationality) e.nationality = t("pc.pax.error.required")
    if (!/^[A-Za-z0-9]{5,12}$/.test(row.passportNumber.trim()))
      e.passportNumber = t("pc.pax.error.passportFormat")

    if (!row.passportExpiry) e.passportExpiry = t("pc.pax.error.required")
    else {
      const need = addMonths(lastDate, 6)
      if (row.passportExpiry < lastDate)
        e.passportExpiry = t("pc.pax.error.expiresBefore")
      else if (row.passportExpiry < need)
        e.passportExpiry = t("pc.pax.error.validUntil", { date: fmtDateY(need) })
    }

    if (!row.issuingCountry) e.issuingCountry = t("pc.pax.error.required")
    return e
  }

  const allErrors = rows.map(errorsFor)
  const complete = allErrors.every((e) => Object.keys(e).length === 0)

  /*
   * BO-11 · a lista de campos por preencher, com o endereço de cada um.
   *
   * Derivada de `allErrors`, que é a mesma validação que pinta os campos de
   * vermelho — não uma segunda regra. Cada linha diz de que passageiro é, porque
   * "Passport number" repetido três vezes não distingue nada.
   */
  const missing = allErrors.flatMap((errors, index) =>
    Object.entries(errors).map(([field, message]) => ({
      target: `pax${index}-${field}`,
      label: `P${index + 1} ${rows[index].surname || t(KIND_KEY[rows[index].kind])} · ${message}`,
    }))
  )

  /** Leva ao campo: desloca até ele e deixa-o marcado, como já estava. */
  const jumpTo = (target: string) => {
    document
      .getElementById(target)
      ?.scrollIntoView({ block: "center", behavior: "smooth" })
  }

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

      toast(t("pc.pax.saved"))
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
        <span className="eyebrow">{t("pc.pax.eyebrow")}</span>
        <h1>
          {t("pc.pax.headingBefore")}
          <em>{t("pc.pax.headingEm")}</em>
          {t("pc.pax.headingAfter")}
        </h1>
        <p>{t("pc.pax.intro")}</p>
      </section>

      <PickedOption state={state} />

      <div className="card">
        <div className="sechead">
          <h3>{t("pc.pax.cardTitle")}</h3>
          <span className="rt">
            {paxShort(state.request)} · {t("pc.pax.asInPassport")}
          </span>
        </div>
        <p className="notice">
          {t("pc.pax.warnBefore")}
          <b>{t("pc.pax.warnBold")}</b>
        </p>

        {/*
          BO-11 · what is missing, listed at the top, each item jumping to its
          field. With three passengers and nine fields each there are 27 boxes,
          and "something is missing below" leaves the search to the person
          reading it. The list is derived from the same validation that colours
          the fields, so it shrinks as they are filled in.
        */}
        {showErrors && !complete && (
          <div className="notice" role="alert" style={{ marginTop: 10 }}>
            <b>
              {missing.length === 1
                ? t("pc.pax.missingOne")
                : t("pc.pax.missingMany", { count: missing.length })}
            </b>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {missing.map((item) => (
                <li key={item.target}>
                  <button
                    type="button"
                    onClick={() => jumpTo(item.target)}
                    style={{
                      border: 0,
                      background: "none",
                      font: "inherit",
                      padding: 0,
                      color: "inherit",
                      cursor: "pointer",
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
                      {t(KIND_KEY[row.kind])} {index + 1}
                    </b>
                    <span>{kindSub(row.kind, index === 0, t)}</span>
                  </div>
                  <span className={`st2${done ? " ok" : ""}`}>
                    {done ? t("pc.pax.field.complete") : t("pc.pax.field.toFill")}
                  </span>
                </div>
                <div className="paxcard-b">
                  <div className="pgrid">
                    {isAdult && (
                      <Field
                        cls="c4"
                        label={t("pc.pax.field.title")}
                        error={showErrors ? errors.title : undefined}
                      id={`pax${index}-title`}
                      >
                        <select
                          value={row.title}
                          onChange={(event) => patch(index, "title", event.target.value)}
                        >
                          <option value="" disabled>
                            {t("pc.pax.field.select")}
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
                      label={t("pc.pax.field.given")}
                      hint={t("pc.pax.field.givenHint")}
                      error={showErrors ? errors.given : undefined}
                      id={`pax${index}-given`}
                    >
                      <input
                        placeholder={t("pc.pax.field.asInPassport")}
                        value={row.given}
                        onChange={(event) => patch(index, "given", event.target.value)}
                      />
                    </Field>

                    <Field
                      cls="c6"
                      label={t("pc.pax.field.surname")}
                      error={showErrors ? errors.surname : undefined}
                      id={`pax${index}-surname`}
                    >
                      <input
                        placeholder={t("pc.pax.field.asInPassport")}
                        value={row.surname}
                        onChange={(event) => patch(index, "surname", event.target.value)}
                      />
                    </Field>

                    <Field
                      cls="c6"
                      label={t("pc.pax.field.dob")}
                      hint={
                        row.kind === "child"
                          ? t("pc.pax.field.dobChild")
                          : row.kind === "adult"
                            ? t("pc.pax.field.dobAdult")
                            : t("pc.pax.field.dobInfant")
                      }
                      error={showErrors ? errors.dob : undefined}
                      id={`pax${index}-dob`}
                    >
                      <input
                        type="date"
                        max={travelDate}
                        value={row.dob}
                        onChange={(event) => patch(index, "dob", event.target.value)}
                      />
                    </Field>

                    <Field cls="c6" label={t("pc.pax.field.sex")} error={showErrors ? errors.sex : undefined}
                      id={`pax${index}-sex`}>
                      <select
                        value={row.sex}
                        onChange={(event) => patch(index, "sex", event.target.value)}
                      >
                        <option value="" disabled>
                          {t("pc.pax.field.select")}
                        </option>
                        {Object.entries(SEX_KEY).map(([value, key]) => (
                          <option key={value} value={value}>
                            {t(key)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      cls="c6"
                      label={t("pc.pax.field.nationality")}
                      error={showErrors ? errors.nationality : undefined}
                      id={`pax${index}-nationality`}
                    >
                      <select
                        value={row.nationality}
                        onChange={(event) => patch(index, "nationality", event.target.value)}
                      >
                        <option value="" disabled>
                          {t("pc.pax.field.select")}
                        </option>
                        {NATIONALITIES.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      cls="c6"
                      label={t("pc.pax.field.passportNumber")}
                      error={showErrors ? errors.passportNumber : undefined}
                      id={`pax${index}-passportNumber`}
                    >
                      <input
                        className="mono"
                        placeholder={t("pc.pax.field.passportSample")}
                        style={{ letterSpacing: ".04em" }}
                        value={row.passportNumber}
                        onChange={(event) =>
                          patch(index, "passportNumber", event.target.value)
                        }
                      />
                    </Field>

                    <Field
                      cls="c6"
                      label={t("pc.pax.field.passportExpiry")}
                      hint={t("pc.pax.field.passportExpiryHint")}
                      error={showErrors ? errors.passportExpiry : undefined}
                      id={`pax${index}-passportExpiry`}
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
                      label={t("pc.pax.field.issuingCountry")}
                      error={showErrors ? errors.issuingCountry : undefined}
                      id={`pax${index}-issuingCountry`}
                    >
                      <select
                        value={row.issuingCountry}
                        onChange={(event) =>
                          patch(index, "issuingCountry", event.target.value)
                        }
                      >
                        <option value="" disabled>
                          {t("pc.pax.field.select")}
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
            {t("pc.pax.completeAll")}
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
          <b>{t("pc.pax.consentBold")}</b>
          {t("pc.pax.consentRest")}
        </p>
      </label>
      {showErrors && !ack && (
        <span className="err" style={{ marginTop: 8, display: "block" }}>
          {t("pc.pax.consentMissing")}
        </span>
      )}

      {serverError && (
        <span className="err" style={{ marginTop: 10, display: "block" }}>
          {serverError}
        </span>
      )}

      <div className="card tight" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="button" disabled={pending} onClick={submit}>
          {pending ? t("pc.pax.saving") : t("pc.pax.continue")}
        </button>
        <p className="subnote">{t("pc.pax.nothingCharged")}</p>
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
  id,
  children,
}: {
  cls: string
  label: string
  hint?: string
  error?: string
  /** BO-11 · o alvo a que um item da lista de erros salta. */
  id?: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className={`ff ${cls}${error ? " bad" : ""}`}>
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
