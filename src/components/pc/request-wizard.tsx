"use client"

/**
 * WeeFly Price Checker — P1 e P2, o pedido.
 *
 * Um só componente para os dois ecrãs porque são um só formulário: o P2 é a
 * segunda metade do que o P1 começou, e separá-los em duas rotas faria o cliente
 * perder o que escreveu ao voltar atrás.
 *
 * O que o mockup fazia com `document.getElementById` está aqui em estado de
 * React. A validação é a mesma, campo por campo, com as mesmas mensagens — é
 * ela que decide se o botão avança, e o servidor volta a fazê-la (ver
 * `requestSchema` em actions/pc.ts) porque este ficheiro corre no browser do
 * cliente.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { submitPcRequest } from "@/actions/pc"
import {
  AP,
  CABINS,
  CCS,
  CURRENCIES,
  TRIPS,
  airportLabel,
  searchAirports,
  type Airport,
  type CabinKind,
  type TripKind,
} from "@/lib/pc/catalog"
import {
  CABIN_LABEL,
  daysBetween,
  fmtDate,
  paxFull,
  todayISO,
} from "@/lib/pc/format"
import {
  IcChevron,
  IcMail,
  IcNext,
  IcBack,
  IcPin,
  IcSwap,
  IcTick,
  IcUser,
  IcWa,
} from "@/components/pc/bits"
import { PcStepper, PcTopbar, useToast, type PcLang } from "@/components/pc/chrome"

interface Leg {
  origin: string | null
  destination: string | null
  date: string
}

const blankLeg = (): Leg => ({ origin: null, destination: null, date: "" })

/** Guardado localmente enquanto o pedido não existe — ver o comentário no boot. */
const DRAFT_KEY = "weefly.pc.draft.v1"

export function RequestWizard({
  initialLang,
  initialCurrency,
  initialDialCode,
  agentSlug,
}: {
  initialLang: PcLang
  initialCurrency: string
  initialDialCode: string
  agentSlug: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [step, setStep] = useState<1 | 2>(1)

  // ── P1 ────────────────────────────────────────────────────────────────────
  const [trip, setTrip] = useState<TripKind>("round")
  const [cabin, setCabin] = useState<CabinKind>("economy")
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [infSeat, setInfSeat] = useState(0)
  const [infLap, setInfLap] = useState(0)
  const [origin, setOrigin] = useState<string | null>(null)
  const [destination, setDestination] = useState<string | null>(null)
  const [depart, setDepart] = useState("")
  const [ret, setRet] = useState("")
  const [legs, setLegs] = useState<Leg[]>([blankLeg(), blankLeg(), blankLeg()])
  const [thirdLeg, setThirdLeg] = useState(false)

  // ── P2 ────────────────────────────────────────────────────────────────────
  const [name, setName] = useState("")
  const [dialCode, setDialCode] = useState(initialDialCode)
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [consent, setConsent] = useState(false)

  // ── preferências do link ──────────────────────────────────────────────────
  const [lang, setLang] = useState<PcLang>(initialLang)
  const [currency, setCurrency] = useState(
    CURRENCIES.includes(initialCurrency) ? initialCurrency : "EUR"
  )

  // ── erros ─────────────────────────────────────────────────────────────────
  const [bad, setBad] = useState<Record<string, boolean>>({})
  const [errText, setErrText] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const [openPop, setOpenPop] = useState<string | null>(null)
  const paxSnapshot = useRef<[number, number, number, number] | null>(null)

  /*
   * Um rascunho local, e só um rascunho.
   *
   * Enquanto o pedido não é submetido não existe nada do lado do servidor para
   * onde o guardar — e perder meia dúzia de campos por causa de um telefone que
   * bloqueou o ecrã é a razão mais banal para não acabar um pedido. Depois de
   * submetido isto é apagado: a partir daí a verdade é o token.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (typeof d !== "object" || !d) return
      if (d.trip) setTrip(d.trip)
      if (d.cabin) setCabin(d.cabin)
      if (d.adults) setAdults(d.adults)
      if (typeof d.children === "number") setChildren(d.children)
      if (typeof d.infSeat === "number") setInfSeat(d.infSeat)
      if (typeof d.infLap === "number") setInfLap(d.infLap)
      if (d.origin) setOrigin(d.origin)
      if (d.destination) setDestination(d.destination)
      if (d.depart) setDepart(d.depart)
      if (d.ret) setRet(d.ret)
      if (Array.isArray(d.legs) && d.legs.length === 3) setLegs(d.legs)
      if (d.thirdLeg) setThirdLeg(true)
      if (d.name) setName(d.name)
      if (d.phone) setPhone(d.phone)
      if (d.email) setEmail(d.email)
      /* O indicativo do link ganha ao do rascunho: quem partilhou o link sabe
         de que mercado é o cliente. */
      if (d.dialCode && !initialDialCode) setDialCode(d.dialCode)
    } catch {
      /* rascunho corrompido é rascunho que não existe */
    }
  }, [initialDialCode])

  useEffect(() => {
    const draft = {
      trip, cabin, adults, children, infSeat, infLap,
      origin, destination, depart, ret, legs, thirdLeg,
      name, phone, email, dialCode,
    }
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* modo privado sem quota — o formulário continua a funcionar */
    }
  }, [trip, cabin, adults, children, infSeat, infLap, origin, destination,
      depart, ret, legs, thirdLeg, name, phone, email, dialCode])

  // Fecha os popovers ao clicar fora, como no mockup.
  useEffect(() => {
    const close = () => setOpenPop(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPop(null)
    }
    document.addEventListener("click", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  const activeLegs = useMemo(
    () => (thirdLeg ? legs : legs.slice(0, 2)),
    [legs, thirdLeg]
  )

  const paxMix = {
    adults,
    children,
    infantsInSeat: infSeat,
    infantsOnLap: infLap,
  }
  const paxCount = adults + children + infSeat + infLap

  const nights =
    trip === "round" && depart && ret ? daysBetween(depart, ret) : 0

  const clear = (key: string) => {
    setBad((b) => ({ ...b, [key]: false }))
    setErrText((e) => ({ ...e, [key]: "" }))
  }

  const setLeg = (index: number, patch: Partial<Leg>) =>
    setLegs((current) =>
      current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg))
    )

  // ── P1 → P2 ───────────────────────────────────────────────────────────────
  function goToContact() {
    const nextBad: Record<string, boolean> = {}
    const nextErr: Record<string, string> = {}

    if (trip === "multi") {
      const incomplete = activeLegs.some(
        (l) => !l.origin || !l.destination || l.origin === l.destination || !l.date
      )
      const outOfOrder = activeLegs.some(
        (l, i) => i > 0 && l.date && activeLegs[i - 1].date && l.date < activeLegs[i - 1].date
      )
      if (incomplete || outOfOrder) {
        nextBad.multi = true
        nextErr.multi =
          outOfOrder && !incomplete
            ? "Each flight must be on or after the previous one"
            : "Fill in each flight with origin, destination and date, and use different airports"
      }
    } else {
      if (!origin) nextBad.origin = true
      if (!destination) nextBad.dest = true
      if (origin && destination && origin === destination) {
        nextBad.dest = true
        nextErr.dest = "Choose a different arrival airport"
      }
      if (!depart || (trip === "round" && !ret)) {
        nextBad.dates = true
        nextErr.dates = "Enter your travel dates"
      } else if (trip === "round" && ret < depart) {
        nextBad.dates = true
        nextErr.dates = "The return cannot be before the departure"
      }
    }

    setBad(nextBad)
    setErrText(nextErr)

    if (Object.keys(nextBad).length) {
      document
        .querySelector(".f.bad, .datebox.bad, #errMulti")
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }

    setStep(2)
    window.scrollTo(0, 0)
  }

  // ── P2 → submeter ─────────────────────────────────────────────────────────
  function submit() {
    const nextBad: Record<string, boolean> = {}
    const cleanName = name.trim().replace(/\s+/g, " ")
    const digits = phone.replace(/\D/g, "")

    if (cleanName.split(" ").filter(Boolean).length < 2) nextBad.name = true
    if (digits.length < 6 || digits.length > 15) nextBad.phone = true
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())) nextBad.email = true
    if (!consent) nextBad.consent = true

    setBad(nextBad)
    if (Object.keys(nextBad).length) {
      document
        .querySelector(".f.bad")
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }

    setServerError(null)

    startTransition(async () => {
      const result = await submitPcRequest({
        trip,
        cabin,
        adults,
        children,
        infantsInSeat: infSeat,
        infantsOnLap: infLap,
        origin,
        destination,
        departDate: trip === "multi" ? undefined : depart,
        returnDate: trip === "round" ? ret : null,
        legs:
          trip === "multi"
            ? activeLegs.map((l) => ({
                origin: l.origin!,
                destination: l.destination!,
                date: l.date,
              }))
            : [],
        name: cleanName,
        dialCode,
        phone: digits,
        email: email.trim(),
        consent: true,
        locale: lang.toLowerCase() as "pt" | "en" | "fr",
        currency,
        agentSlug,
      })

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      try {
        window.localStorage.removeItem(DRAFT_KEY)
        /* O token é o endereço permanente do pedido. Guardado para quem voltar
           a /pc sem o link — é o que lhe devolve o pedido em vez de o obrigar a
           preencher tudo outra vez. */
        window.localStorage.setItem("weefly.pc.token", result.token)
      } catch {
        /* sem storage o link do email continua a servir */
      }

      router.push(`/pc/${result.token}`)
    })
  }

  const recap = [
    trip === "multi"
      ? activeLegs
          .filter((l) => l.origin && l.destination)
          .map((l) => `${l.origin}→${l.destination}`)
          .join(" · ")
      : origin && destination
        ? `${AP(origin)?.ct} → ${AP(destination)?.ct}`
        : "",
    trip === "multi"
      ? ""
      : depart
        ? trip === "round" && ret
          ? `${fmtDate(depart)}–${fmtDate(ret)}`
          : fmtDate(depart)
        : "",
    paxFull(paxMix),
    CABIN_LABEL[cabin],
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <PcTopbar
        currency={currency}
        lang={lang}
        onLangChange={setLang}
        onCurrencyChange={setCurrency}
      />
      <PcStepper step={step} />

      {/* ═══ P1 · fare request ═══ */}
      <main className="shell view" hidden={step !== 1}>
        <section className="hero">
          <span className="eyebrow">No commitment · reply on WhatsApp</span>
          <h1>
            Let&apos;s find <em>the best fare</em> for your flight
          </h1>
          <p>
            Tell us where you are going. Our team searches several airlines and
            comes back to you with the best options.
          </p>
        </section>

        <div className="card">
          <div className="selbar">
            {/* tipo de viagem */}
            <Selector
              id="trip"
              open={openPop === "trip"}
              onToggle={setOpenPop}
              icon={<IcSwap size={17} />}
              label={TRIPS[trip]}
            >
              {(Object.keys(TRIPS) as TripKind[]).map((key) => (
                <button
                  key={key}
                  className="opt"
                  type="button"
                  aria-checked={key === trip}
                  onClick={() => {
                    setTrip(key)
                    setOpenPop(null)
                  }}
                >
                  <span className="ck">
                    <IcTick />
                  </span>
                  <span className="tx">{TRIPS[key]}</span>
                </button>
              ))}
            </Selector>

            {/* passageiros */}
            <div className={`sel${openPop === "pax" ? " open" : ""}`}>
              <button
                type="button"
                aria-expanded={openPop === "pax"}
                onClick={(event) => {
                  event.stopPropagation()
                  if (openPop === "pax") return setOpenPop(null)
                  paxSnapshot.current = [adults, children, infSeat, infLap]
                  setOpenPop("pax")
                }}
              >
                <span className="ic">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="5.6" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M3 15.4c.7-3 3.1-4.6 6-4.6s5.3 1.6 6 4.6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </span>
                <span>{paxCount}</span>
                <span className="cr">
                  <IcChevron />
                </span>
              </button>
              <div className="pop pax" onClick={(e) => e.stopPropagation()}>
                <Counter
                  title="Adults"
                  note="12 and over"
                  value={adults}
                  min={1}
                  max={9}
                  onChange={(v) => {
                    setAdults(v)
                    setInfLap((lap) => Math.min(lap, v))
                  }}
                />
                <Counter
                  title="Children"
                  note="aged 2 to 11"
                  value={children}
                  min={0}
                  max={8}
                  onChange={setChildren}
                />
                <Counter
                  title="Infants"
                  note="in seat"
                  value={infSeat}
                  min={0}
                  max={4}
                  onChange={setInfSeat}
                />
                <Counter
                  title="Infants"
                  note="on lap · one per adult"
                  value={infLap}
                  min={0}
                  max={adults}
                  onChange={setInfLap}
                />
                <div className="popfoot">
                  <button
                    type="button"
                    onClick={() => {
                      const snap = paxSnapshot.current
                      if (snap) {
                        setAdults(snap[0])
                        setChildren(snap[1])
                        setInfSeat(snap[2])
                        setInfLap(snap[3])
                      }
                      setOpenPop(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="pri" onClick={() => setOpenPop(null)}>
                    Done
                  </button>
                </div>
              </div>
            </div>

            {/* cabine */}
            <Selector
              id="cabin"
              open={openPop === "cabin"}
              onToggle={setOpenPop}
              label={CABINS[cabin]}
            >
              {(Object.keys(CABINS) as CabinKind[]).map((key) => (
                <button
                  key={key}
                  className="opt"
                  type="button"
                  aria-checked={key === cabin}
                  onClick={() => {
                    setCabin(key)
                    setOpenPop(null)
                  }}
                >
                  <span className="ck">
                    <IcTick />
                  </span>
                  <span className="tx">{CABINS[key]}</span>
                </button>
              ))}
            </Selector>
          </div>

          {/* rota simples */}
          {trip !== "multi" && (
            <div>
              <div className="routebox">
                <AirportField
                  id="origin"
                  label="From"
                  placeholder="Where from?"
                  value={origin}
                  bad={bad.origin}
                  error={errText.origin ?? "Choose the departure airport"}
                  onPick={(ia) => {
                    setOrigin(ia)
                    clear("origin")
                  }}
                />
                <button
                  className="swap"
                  type="button"
                  title="Swap"
                  aria-label="Swap origin and destination"
                  onClick={() => {
                    setOrigin(destination)
                    setDestination(origin)
                    clear("origin")
                    clear("dest")
                  }}
                >
                  <IcSwap />
                </button>
                <AirportField
                  id="dest"
                  label="To"
                  placeholder="Where to?"
                  value={destination}
                  bad={bad.dest}
                  error={errText.dest ?? "Choose the arrival airport"}
                  onPick={(ia) => {
                    setDestination(ia)
                    clear("dest")
                  }}
                />
              </div>

              <div className={`datebox${trip === "oneway" ? " solo" : ""}${bad.dates ? " bad" : ""}`}>
                <div className="dcell">
                  <label htmlFor="dep">Departure</label>
                  <input
                    id="dep"
                    type="date"
                    min={todayISO()}
                    value={depart}
                    onChange={(event) => {
                      setDepart(event.target.value)
                      if (ret && ret < event.target.value) setRet("")
                      clear("dates")
                    }}
                  />
                </div>
                {trip !== "oneway" && (
                  <div className="dcell">
                    <label htmlFor="ret">Return</label>
                    <input
                      id="ret"
                      type="date"
                      min={depart || todayISO()}
                      value={ret}
                      onChange={(event) => {
                        setRet(event.target.value)
                        clear("dates")
                      }}
                    />
                  </div>
                )}
              </div>
              {nights > 0 && (
                <span className="nights">
                  {nights} {nights === 1 ? "night at the destination" : "nights at the destination"}
                </span>
              )}
              {bad.dates && (
                <span className="err" style={{ marginTop: 6, display: "block" }}>
                  {errText.dates}
                </span>
              )}
            </div>
          )}

          {/* multi-city */}
          {trip === "multi" && (
            <div>
              {[0, 1, 2].map((index) => {
                if (index === 2 && !thirdLeg) return null
                const leg = legs[index]
                return (
                  <div className="leg" key={index}>
                    <div className="leghead">
                      <span className="legtag">Flight {index + 1}</span>
                      {index === 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setThirdLeg(false)
                            setLeg(2, blankLeg())
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="routebox">
                      <AirportField
                        id={`o${index}`}
                        label="From"
                        placeholder="Where from?"
                        value={leg.origin}
                        onPick={(ia) => {
                          setLeg(index, { origin: ia })
                          clear("multi")
                        }}
                      />
                      <AirportField
                        id={`d${index}`}
                        label="To"
                        placeholder="Where to?"
                        value={leg.destination}
                        onPick={(ia) => {
                          setLeg(index, { destination: ia })
                          clear("multi")
                        }}
                      />
                    </div>
                    <div className="datebox solo" style={{ marginTop: 10 }}>
                      <div className="dcell">
                        <label htmlFor={`dt${index}`}>Date</label>
                        <input
                          id={`dt${index}`}
                          type="date"
                          min={index === 0 ? todayISO() : legs[index - 1].date || todayISO()}
                          value={leg.date}
                          onChange={(event) => {
                            setLeg(index, { date: event.target.value })
                            clear("multi")
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}

              {!thirdLeg && (
                <button className="addleg" type="button" onClick={() => setThirdLeg(true)}>
                  + Add another flight
                </button>
              )}
              {bad.multi && (
                <span id="errMulti" className="err" style={{ marginTop: 8, display: "block" }}>
                  {errText.multi}
                </span>
              )}
            </div>
          )}

          <div className="actions">
            <button className="btn btn-primary" type="button" onClick={goToContact}>
              Continue
              <IcNext />
            </button>
          </div>
          <p className="subnote">
            You are not buying anything yet. Get the options and decide later.
          </p>
        </div>
        <div className="spacer" />
      </main>

      {/* ═══ P2 · contact details ═══ */}
      <main className="shell view" hidden={step !== 2}>
        <section className="hero">
          <span className="eyebrow">Step 2 of 3</span>
          <h1>
            Where do we send <em>your options</em>?
          </h1>
          <p>{recap || "—"}</p>
        </section>

        <div className="card">
          <div className={`f${bad.name ? " bad" : ""}`}>
            <label className="fl" htmlFor="fullname">
              Full name<span className="req">*</span>
            </label>
            <div className="inp">
              <span className="li">
                <IcUser />
              </span>
              <input
                id="fullname"
                placeholder="Your name"
                autoComplete="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  clear("name")
                }}
              />
            </div>
            <span className="err">Enter your first and last name</span>
          </div>

          <div className={`f${bad.phone ? " bad" : ""}`} style={{ marginTop: 14 }}>
            <label className="fl" htmlFor="phone">
              Phone <span className="walabel">· ideally your WhatsApp number</span>
              <span className="req">*</span>
            </label>
            <div className="phone">
              <div className={`ccwrap sel${openPop === "cc" ? " open" : ""}`}>
                <button
                  type="button"
                  className="ccbtn"
                  aria-expanded={openPop === "cc"}
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenPop(openPop === "cc" ? null : "cc")
                  }}
                >
                  <span>{dialCode}</span>
                  <IcChevron />
                </button>
                <div className="pop scroll" onClick={(e) => e.stopPropagation()}>
                  {CCS.map((code) => (
                    <button
                      key={code.c}
                      className="opt"
                      type="button"
                      aria-checked={code.c === dialCode}
                      onClick={() => {
                        setDialCode(code.c)
                        setOpenPop(null)
                      }}
                    >
                      <span className="ck">
                        <IcTick />
                      </span>
                      <span className="tx">
                        <b className="mono" style={{ fontWeight: 600 }}>
                          {code.c}
                        </b>{" "}
                        <span style={{ color: "#64748B" }}>{code.n}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="wainp">
                <input
                  id="phone"
                  type="tel"
                  placeholder="991 44 07"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value)
                    clear("phone")
                  }}
                />
                <span className="wai">
                  <IcWa />
                </span>
              </div>
            </div>
            <span className="hint">
              We use this number to send your options and to talk to you.
            </span>
            <span className="err">Enter a valid number, 6 to 15 digits</span>
          </div>

          <div className={`f${bad.email ? " bad" : ""}`} style={{ marginTop: 14 }}>
            <label className="fl" htmlFor="email">
              Email<span className="req">*</span>
            </label>
            <div className="inp">
              <span className="li">
                <IcMail />
              </span>
              <input
                id="email"
                type="email"
                placeholder="to receive your ticket"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  clear("email")
                }}
              />
            </div>
            <span className="err">Enter a valid email</span>
          </div>

          <label className="consent" htmlFor="consent">
            <input
              type="checkbox"
              id="consent"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked)
                clear("consent")
              }}
            />
            <p>
              I authorise WeeFly to contact me and to process my data for the
              purposes of this travel request, under the privacy policy.
              <span className="meta">
                We record the date, time and device of this authorisation.
              </span>
            </p>
          </label>
          {bad.consent && (
            <span className="err" style={{ marginTop: 8, display: "block" }}>
              We need this authorisation to continue
            </span>
          )}

          {serverError && (
            <span className="err" style={{ marginTop: 10, display: "block" }}>
              {serverError}
            </span>
          )}

          <div className="actions">
            <button
              className="btn btn-ghost"
              type="button"
              aria-label="Back"
              onClick={() => {
                setStep(1)
                window.scrollTo(0, 0)
              }}
            >
              <IcBack />
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending}
              onClick={submit}
            >
              {pending ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
        <div className="spacer" />
      </main>
    </>
  )
}

// ── peças ────────────────────────────────────────────────────────────────────

function Selector({
  id,
  open,
  onToggle,
  icon,
  label,
  children,
}: {
  id: string
  open: boolean
  onToggle: (id: string | null) => void
  icon?: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className={`sel${open ? " open" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          onToggle(open ? null : id)
        }}
      >
        {icon && <span className="ic">{icon}</span>}
        <span>{label}</span>
        <span className="cr">
          <IcChevron />
        </span>
      </button>
      <div className="pop" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function Counter({
  title,
  note,
  value,
  min,
  max,
  onChange,
}: {
  title: string
  note: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="cnt">
      <div className="t">
        <b>{title}</b>
        <span>{note}</span>
      </div>
      <div className="stp2">
        <button
          type="button"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span>{value}</span>
        <button
          type="button"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  )
}

/**
 * O campo de aeroporto, com sugestões.
 *
 * Um aeroporto meio escrito não é um aeroporto: ao sair do campo sem ter
 * escolhido da lista, o texto é limpo. Sem isso o cliente ficava convencido de
 * ter escrito "Lisboa" e o pedido seguia sem origem.
 */
function AirportField({
  id,
  label,
  placeholder,
  value,
  bad,
  error,
  onPick,
}: {
  id: string
  label: string
  placeholder: string
  value: string | null
  bad?: boolean
  error?: string
  onPick: (iata: string | null) => void
}) {
  const [text, setText] = useState(airportLabel(value))
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  useEffect(() => {
    setText(airportLabel(value))
  }, [value])

  const results: Airport[] = useMemo(
    () => searchAirports(value && text === airportLabel(value) ? "" : text),
    [text, value]
  )
  const isSearch = Boolean(text.trim()) && text !== airportLabel(value)

  function choose(airport: Airport | undefined) {
    if (!airport) return
    onPick(airport.ia)
    setText(airportLabel(airport.ia))
    setOpen(false)
    setHighlight(-1)
  }

  return (
    <div className={`f${bad ? " bad" : ""}${open ? " sugopen" : ""}`}>
      <label className="fl" htmlFor={id}>
        {label}
        <span className="req">*</span>
      </label>
      <div className="inp">
        <span className="li">
          <IcPin />
        </span>
        <input
          id={id}
          placeholder={placeholder}
          autoComplete="off"
          value={text}
          onClick={(event) => event.stopPropagation()}
          onFocus={(event) => {
            event.stopPropagation()
            setOpen(true)
          }}
          onChange={(event) => {
            setText(event.target.value)
            onPick(null)
            setOpen(true)
            setHighlight(-1)
          }}
          onBlur={() => {
            setOpen(false)
            setText(airportLabel(value))
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setHighlight((h) => (h + 1) % Math.max(1, results.length))
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              setHighlight((h) => (h - 1 + results.length) % Math.max(1, results.length))
            } else if (event.key === "Enter" && open && results.length) {
              event.preventDefault()
              choose(results[highlight < 0 ? 0 : highlight])
            }
          }}
        />
      </div>
      <div className="sug" onClick={(event) => event.stopPropagation()}>
        {!isSearch && <div className="sgh">Popular right now</div>}
        {results.length ? (
          results.map((airport, index) => (
            <button
              key={airport.ia}
              type="button"
              className={index === highlight ? "hl" : undefined}
              /* mousedown corre antes do blur do input, por isso a escolha
                 sobrevive; o click é a alternativa para teclado e leitores. */
              onMouseDown={(event) => {
                event.preventDefault()
                choose(airport)
              }}
              onClick={(event) => {
                event.preventDefault()
                choose(airport)
              }}
            >
              <span className="ia">{airport.ia}</span>
              <span>
                <span className="ct">{airport.ct}</span>
                <span className="cy">{airport.cy}</span>
              </span>
            </button>
          ))
        ) : (
          <div style={{ padding: 10, fontSize: 13, color: "#64748B" }}>
            No results. Try typing the city name.
          </div>
        )}
      </div>
      {error && <span className="err">{error}</span>}
    </div>
  )
}
