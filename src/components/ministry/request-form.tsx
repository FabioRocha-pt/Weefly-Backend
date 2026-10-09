"use client"

import Link from "next/link"
import { useState, useTransition } from "react"

import { submitMinistryRequest, type MinistryRequestField } from "@/actions/ministry-space"
import { AirportField, type Place } from "@/components/pc/request-wizard"
import { PcTopbar, usePcBrand } from "@/components/pc/chrome"
import { useT } from "@/i18n/provider"

/**
 * B2G-09 · o formulário simples do ministério. "Só estes campos. Nenhum dado
 * de passageiro neste passo": pessoas (1–50), de onde (Praia por omissão,
 * D-1), para onde (a lista de aeroportos que já existe), ida (não no
 * passado), volta (opcional, não antes da ida), urgência (Normal por omissão,
 * D-6) e notas.
 *
 * Os obrigatórios em falta aparecem listados por cima do botão e destacados
 * no campo. O servidor repete todas as regras (`actions/ministry-space`).
 */

const FIELDS: MinistryRequestField[] = ["people", "origin", "destination", "departDate", "returnDate", "urgency", "notes"]

/** A data de hoje no relógio de quem pede (o `min` dos campos de data). */
function localToday(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function MinistryRequestForm({
  orgSlug,
  linkToken,
  currency,
  defaultOrigin,
}: {
  orgSlug: string
  linkToken: string
  currency: string
  /** D-1 · a Praia, já resolvida no servidor. */
  defaultOrigin: Place | null
}) {
  const t = useT()
  const brand = usePcBrand()
  const [pending, startTransition] = useTransition()

  const [people, setPeople] = useState("1")
  const [origin, setOrigin] = useState<Place | null>(defaultOrigin)
  const [destination, setDestination] = useState<Place | null>(null)
  const [departDate, setDepartDate] = useState("")
  const [returnDate, setReturnDate] = useState("")
  const [urgency, setUrgency] = useState<0 | 1 | 2>(0)
  const [notes, setNotes] = useState("")

  const [missing, setMissing] = useState<MinistryRequestField[]>([])
  const [invalid, setInvalid] = useState<MinistryRequestField[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ reference: string } | null>(null)

  const base = `/ministerios/${orgSlug}/${linkToken}`
  const today = localToday()
  const label = (p: Place | null) => (p ? `${p.city || p.name} (${p.iata})` : "")

  /* As mesmas regras do servidor, para a lista aparecer sem ir à rede. */
  function check(): { missing: MinistryRequestField[]; invalid: MinistryRequestField[] } {
    const miss: MinistryRequestField[] = []
    const bad: MinistryRequestField[] = []
    const n = Number(people)
    if (!people.trim()) miss.push("people")
    else if (!Number.isInteger(n) || n < 1 || n > 50) bad.push("people")
    if (!origin) miss.push("origin")
    if (!destination) miss.push("destination")
    else if (origin && origin.iata === destination.iata) bad.push("destination")
    if (!departDate) miss.push("departDate")
    else if (departDate < today) bad.push("departDate")
    if (returnDate && departDate && returnDate < departDate) bad.push("returnDate")
    if (notes.length > 1000) bad.push("notes")
    return { missing: miss, invalid: bad }
  }

  const isBad = (f: MinistryRequestField) => missing.includes(f) || invalid.includes(f)
  const clear = (f: MinistryRequestField) => {
    setMissing((m) => m.filter((x) => x !== f))
    setInvalid((m) => m.filter((x) => x !== f))
  }

  const fieldLabel: Record<MinistryRequestField, string> = {
    people: t("ministry.form.people"),
    origin: t("ministry.form.origin"),
    destination: t("ministry.form.destination"),
    departDate: t("ministry.form.departDate"),
    returnDate: t("ministry.form.returnDate"),
    urgency: t("ministry.form.urgency"),
    notes: t("ministry.form.notes"),
  }
  const invalidText: Partial<Record<MinistryRequestField, string>> = {
    people: t("ministry.form.errors.people"),
    origin: t("ministry.form.errors.airport"),
    destination:
      origin && destination && origin.iata === destination.iata
        ? t("ministry.form.errors.sameAirport")
        : t("ministry.form.errors.airport"),
    departDate: t("ministry.form.errors.departPast"),
    returnDate: t("ministry.form.errors.returnBefore"),
    notes: t("ministry.form.errors.notes"),
  }

  function submit() {
    setError(null)
    const local = check()
    setMissing(local.missing)
    setInvalid(local.invalid)
    if (local.missing.length || local.invalid.length) return

    startTransition(async () => {
      const res = await submitMinistryRequest(orgSlug, linkToken, {
        people,
        origin: origin?.iata ?? null,
        destination: destination?.iata ?? null,
        departDate,
        returnDate: returnDate || null,
        urgency,
        notes: notes.trim() || null,
      })
      if (res.ok) {
        setDone({ reference: res.reference })
        window.scrollTo({ top: 0 })
        return
      }
      setError(res.error)
      setMissing(res.missing ?? [])
      setInvalid(res.invalid ?? [])
    })
  }

  function reset() {
    setPeople("1")
    setOrigin(defaultOrigin)
    setDestination(null)
    setDepartDate("")
    setReturnDate("")
    setUrgency(0)
    setNotes("")
    setMissing([])
    setInvalid([])
    setError(null)
    setDone(null)
  }

  if (done) {
    return (
      <>
        <PcTopbar currency={currency} lang="pt" reference={done.reference} />
        <main className="shell">
          <div className="hero-c" role="status">
            <h2>{t("ministry.form.done.title")}</h2>
            <p className="mono" style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", margin: "12px 0 0" }}>
              {done.reference}
            </p>
            <p>{t("ministry.form.done.body", { reference: done.reference, partner: brand?.name ?? "" })}</p>
          </div>
          <div className="actions" style={{ flexDirection: "column" }}>
            <Link className="btn btn-primary" href={`${base}/pedidos`}>
              {t("ministry.form.done.view")}
            </Link>
            <button className="btn btn-ghost" type="button" onClick={reset}>
              {t("ministry.form.done.another")}
            </button>
          </div>
        </main>
      </>
    )
  }

  const problems = [...missing, ...invalid.filter((f) => !missing.includes(f))]

  return (
    <>
      <PcTopbar currency={currency} lang="pt" />
      <main className="shell">
        <section className="hero">
          <h1>{t("ministry.form.title")}</h1>
          <p>{t("ministry.form.intro")}</p>
        </section>

        <form
          className="card"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Número de pessoas */}
          <div className={`f${isBad("people") ? " bad" : ""}`}>
            <label className="fl" htmlFor="m-people">
              {t("ministry.form.people")}
              <span className="req">*</span>
            </label>
            <div className="inp">
              <input
                id="m-people"
                className="plain"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                step={1}
                value={people}
                onChange={(e) => {
                  setPeople(e.target.value)
                  clear("people")
                }}
              />
            </div>
            <span className="hint">{t("ministry.form.peopleHint")}</span>
            <span className="err">{t("ministry.form.errors.people")}</span>
          </div>

          {/* De onde · para onde */}
          <div className="routebox">
            <AirportField
              id="m-origin"
              label={t("ministry.form.origin")}
              placeholder={t("ministry.form.airportPlaceholder")}
              value={origin?.iata ?? null}
              valueLabel={label(origin)}
              bad={isBad("origin")}
              error={invalidText.origin}
              onPick={(place) => {
                setOrigin(place)
                clear("origin")
              }}
            />
            <AirportField
              id="m-destination"
              label={t("ministry.form.destination")}
              placeholder={t("ministry.form.airportPlaceholder")}
              value={destination?.iata ?? null}
              valueLabel={label(destination)}
              bad={isBad("destination")}
              error={invalidText.destination}
              onPick={(place) => {
                setDestination(place)
                clear("destination")
              }}
            />
          </div>

          {/* Ida · volta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className={`f${isBad("departDate") ? " bad" : ""}`}>
              <label className="fl" htmlFor="m-depart">
                {t("ministry.form.departDate")}
                <span className="req">*</span>
              </label>
              <div className="inp">
                <input
                  id="m-depart"
                  className="plain"
                  type="date"
                  min={today}
                  value={departDate}
                  onChange={(e) => {
                    setDepartDate(e.target.value)
                    clear("departDate")
                    clear("returnDate")
                  }}
                />
              </div>
              <span className="err">{t("ministry.form.errors.departPast")}</span>
            </div>
            <div className={`f${isBad("returnDate") ? " bad" : ""}`}>
              <label className="fl" htmlFor="m-return">
                {t("ministry.form.returnDate")}
                <span className="hint" style={{ fontWeight: 500 }}>
                  {" "}
                  · {t("ministry.form.optional")}
                </span>
              </label>
              <div className="inp">
                <input
                  id="m-return"
                  className="plain"
                  type="date"
                  min={departDate || today}
                  value={returnDate}
                  onChange={(e) => {
                    setReturnDate(e.target.value)
                    clear("returnDate")
                  }}
                />
              </div>
              <span className="hint">{t("ministry.form.returnHint")}</span>
              <span className="err">{t("ministry.form.errors.returnBefore")}</span>
            </div>
          </div>

          {/* Urgência */}
          <div className="f" role="radiogroup" aria-labelledby="m-urgency">
            <span className="fl" id="m-urgency" style={{ fontSize: 12, fontWeight: 700, color: "var(--navy-soft)" }}>
              {t("ministry.form.urgency")}
              <span className="req" style={{ color: "var(--ember)", marginLeft: 2 }}>
                *
              </span>
            </span>
            <div className="chips">
              {([0, 1, 2] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  className="chip"
                  role="radio"
                  aria-checked={urgency === u}
                  aria-pressed={urgency === u}
                  onClick={() => setUrgency(u)}
                >
                  {t(`ministry.urgency.${u}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div className={`f${isBad("notes") ? " bad" : ""}`}>
            <label className="fl" htmlFor="m-notes">
              {t("ministry.form.notes")}
              <span className="hint" style={{ fontWeight: 500 }}>
                {" "}
                · {t("ministry.form.optional")}
              </span>
            </label>
            <textarea
              id="m-notes"
              rows={3}
              maxLength={1000}
              placeholder={t("ministry.form.notesPlaceholder")}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                clear("notes")
              }}
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid var(--line)",
                borderRadius: 10,
                font: "inherit",
                resize: "vertical",
              }}
            />
            <span className="err">{t("ministry.form.errors.notes")}</span>
          </div>

          {/* Os obrigatórios em falta (e os inválidos), listados. */}
          {problems.length > 0 && (
            <div className="notice" role="alert" style={{ background: "var(--ember-tint)", color: "var(--ember-dk)" }}>
              {missing.length > 0 && (
                <>
                  <b>{t("ministry.form.missingTitle")}</b>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {FIELDS.filter((f) => missing.includes(f)).map((f) => (
                      <li key={f}>{fieldLabel[f]}</li>
                    ))}
                  </ul>
                </>
              )}
              {invalid.filter((f) => !missing.includes(f)).length > 0 && (
                <>
                  <b style={{ display: "block", marginTop: missing.length ? 8 : 0 }}>{t("ministry.form.invalidTitle")}</b>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {FIELDS.filter((f) => invalid.includes(f) && !missing.includes(f)).map((f) => (
                      <li key={f}>
                        {fieldLabel[f]} · {invalidText[f] ?? ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {error && !problems.length && (
            <p className="notice" role="alert" style={{ background: "var(--ember-tint)", color: "var(--ember-dk)" }}>
              {error}
            </p>
          )}

          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? t("ministry.form.sending") : t("ministry.form.submit")}
          </button>
        </form>
      </main>
    </>
  )
}
