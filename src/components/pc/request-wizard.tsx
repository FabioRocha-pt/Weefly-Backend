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
 *
 * Os aeroportos e os indicativos deixaram de estar em duro aqui dentro: os
 * aeroportos vêm de `/api/airports` (nove mil, com o catálogo a viver no
 * servidor) e os países de `lib/countries.ts` (todos, 7 KB porque o campo filtra
 * a cada tecla).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { submitPcRequest } from "@/actions/pc"
import {
  CABINS,
  CURRENCIES,
  MAX_LEGS,
  MIN_LEGS,
  TRIPS,
  type CabinKind,
  type TripKind,
} from "@/lib/pc/catalog"
import {
  COUNTRY_BY_ISO,
  DEFAULT_COUNTRY,
  countryName,
  flagOf,
  searchCountries,
  toE164,
} from "@/lib/countries"
import { CABIN_LABEL, daysBetween, fmtDate, paxFull, todayISO } from "@/lib/pc/format"
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
import { PcStepper, PcTopbar, type PcLang } from "@/components/pc/chrome"

/** Um aeroporto como o campo o mostra, depois de escolhido da lista. */
interface Place {
  iata: string
  city: string
  name: string
  country: string
  countryName: string
}

interface Leg {
  origin: string | null
  destination: string | null
  date: string
}

const blankLeg = (): Leg => ({ origin: null, destination: null, date: "" })

/** Guardado localmente enquanto o pedido não existe — ver o comentário no boot. */
const DRAFT_KEY = "weefly.pc.draft.v2"

const placeLabel = (place: Place | undefined): string =>
  place ? `${place.city || place.name} (${place.iata})` : ""

export function RequestWizard({
  initialLang,
  initialCurrency,
  initialCountry,
  agentSlug,
}: {
  initialLang: PcLang
  initialCurrency: string
  /**
   * ISO do país que o link fixou (`?country=` ou `?cc=`), já resolvido no
   * servidor — nulo quando o link não disse nada. A distinção importa: um país
   * escolhido por quem partilhou o link ganha ao rascunho; a ausência dele
   * deixa o rascunho ganhar, e é isso que devolve o país a quem já o escolheu.
   */
  initialCountry: string | null
  agentSlug: string | null
}) {
  const router = useRouter()
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
  const [legs, setLegs] = useState<Leg[]>([blankLeg(), blankLeg()])

  /*
   * Os aeroportos já escolhidos, por código.
   *
   * O estado guarda códigos — é o que vai para o servidor — e este mapa guarda
   * o nome que os acompanha no ecrã. Sem ele, um rascunho recuperado mostrava
   * "RAI" onde antes dizia "Praia (RAI)".
   */
  const [places, setPlaces] = useState<Record<string, Place>>({})

  // ── P2 ────────────────────────────────────────────────────────────────────
  const [name, setName] = useState("")
  const [country, setCountry] = useState(initialCountry ?? DEFAULT_COUNTRY)
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

  const dialCode = COUNTRY_BY_ISO[country]?.dial ?? "+238"
  const localeTag = lang.toLowerCase()

  const remember = useCallback((place: Place) => {
    setPlaces((current) =>
      current[place.iata] ? current : { ...current, [place.iata]: place }
    )
  }, [])

  /*
   * Um rascunho local, e só um rascunho.
   *
   * Enquanto o pedido não é submetido não existe nada do lado do servidor para
   * onde o guardar — e perder meia dúzia de campos por causa de um telefone que
   * bloqueou o ecrã é a razão mais banal para não acabar um pedido. Depois de
   * submetido isto é apagado: a partir daí a verdade é o token.
   */
  useEffect(() => {
    let alive = true
    let codes: string[] = []

    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (typeof d === "object" && d) {
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
          if (Array.isArray(d.legs) && d.legs.length >= MIN_LEGS) {
            setLegs(d.legs.slice(0, MAX_LEGS))
          }
          if (d.name) setName(d.name)
          if (d.phone) setPhone(d.phone)
          if (d.email) setEmail(d.email)
          /* O país do link ganha ao do rascunho: quem partilhou o link sabe de
             que mercado é o cliente. */
          if (d.country && !initialCountry) setCountry(d.country)

          codes = [
            d.origin,
            d.destination,
            ...(Array.isArray(d.legs)
              ? d.legs.flatMap((l: Leg) => [l.origin, l.destination])
              : []),
          ].filter(Boolean)
        }
      }
    } catch {
      /* rascunho corrompido é rascunho que não existe */
    }

    /* Os códigos do rascunho voltam a ganhar nome numa só ida ao catálogo. */
    if (codes.length) {
      fetch(`/api/airports?iata=${encodeURIComponent(codes.join(","))}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (!alive || !json?.results) return
          setPlaces((current) => {
            const next = { ...current }
            for (const place of json.results as Place[]) next[place.iata] = place
            return next
          })
        })
        .catch(() => {
          /* sem catálogo o campo mostra o código, que é curto mas certo */
        })
    }

    return () => {
      alive = false
    }
  }, [initialCountry])

  useEffect(() => {
    const draft = {
      trip, cabin, adults, children, infSeat, infLap,
      origin, destination, depart, ret, legs,
      name, phone, email, country,
    }
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* modo privado sem quota — o formulário continua a funcionar */
    }
  }, [trip, cabin, adults, children, infSeat, infLap, origin, destination,
      depart, ret, legs, name, phone, email, country])

  /*
   * Fechar os popovers ao clicar fora.
   *
   * A versão anterior punha um `click` no documento e contava com o
   * `stopPropagation` dos botões para o travar. Não trava: o React 18 do App
   * Router escuta no próprio documento, e `stopPropagation` não impede outro
   * ouvinte do mesmo nó de correr. O clique que abria o painel fechava-o no
   * mesmo gesto — era esta a regressão FE-04, em que os três seletores do topo
   * do cartão deixaram de abrir e o pedido seguia sempre com os valores por
   * omissão.
   *
   * Agora a pergunta é feita ao DOM, que é quem sabe a resposta: o clique caiu
   * dentro de algum seletor? Se caiu, quem decide é o próprio botão; se não
   * caiu, fecha. Não depende da ordem dos ouvintes nem de ninguém se lembrar de
   * travar a propagação.
   */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.(".sel")) return
      setOpenPop(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPop(null)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

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

  /**
   * Um voo novo, já começado.
   *
   * O destino do voo anterior é a origem do próximo — é o que acontece em
   * qualquer viagem multi-city, e escrevê-lo outra vez à mão era o passo em que
   * as pessoas desistiam. Continua editável: quem viaja de Lisboa para Paris e
   * apanha o seguinte no Porto muda a origem e segue.
   */
  function addLeg() {
    setLegs((current) => {
      if (current.length >= MAX_LEGS) return current
      const last = current[current.length - 1]
      return [
        ...current,
        { origin: last?.destination ?? null, destination: null, date: "" },
      ]
    })
    clear("multi")
  }

  function removeLeg(index: number) {
    setLegs((current) =>
      current.length <= MIN_LEGS ? current : current.filter((_, i) => i !== index)
    )
    clear("multi")
  }

  // ── P1 → P2 ───────────────────────────────────────────────────────────────
  function goToContact() {
    const nextBad: Record<string, boolean> = {}
    const nextErr: Record<string, string> = {}

    if (trip === "multi") {
      const incomplete = legs.some(
        (l) => !l.origin || !l.destination || l.origin === l.destination || !l.date
      )
      const outOfOrder = legs.some(
        (l, i) => i > 0 && l.date && legs[i - 1].date && l.date < legs[i - 1].date
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
    const nextErr: Record<string, string> = {}
    const cleanName = name.trim().replace(/\s+/g, " ")
    const e164 = toE164(dialCode, phone)

    if (cleanName.split(" ").filter(Boolean).length < 2) nextBad.name = true
    if (!e164) {
      nextBad.phone = true
      nextErr.phone = "Enter a valid number for the country you picked"
    }
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())) nextBad.email = true
    if (!consent) nextBad.consent = true

    setBad(nextBad)
    setErrText((current) => ({ ...current, ...nextErr }))
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
            ? legs.map((l) => ({
                origin: l.origin!,
                destination: l.destination!,
                date: l.date,
              }))
            : [],
        name: cleanName,
        dialCode,
        country,
        phone: e164!,
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

  const cityName = (iata: string | null) =>
    (iata && (places[iata]?.city || places[iata]?.name)) || iata || ""

  const recap = [
    trip === "multi"
      ? legs
          .filter((l) => l.origin && l.destination)
          .map((l) => `${l.origin}→${l.destination}`)
          .join(" · ")
      : origin && destination
        ? `${cityName(origin)} → ${cityName(destination)}`
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
                aria-label={`Passengers · ${paxFull(paxMix)}`}
                onClick={() => {
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
              <div className="pop pax">
                <Counter
                  title="Adults"
                  note="12 and over"
                  value={adults}
                  min={1}
                  max={9}
                  onChange={(v) => {
                    setAdults(v)
                    /* Um bebé de colo por adulto: baixar os adultos baixa também
                       os colos, ou o pedido saía com uma combinação que nenhuma
                       companhia aceita. */
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
                  valueLabel={placeLabel(origin ? places[origin] : undefined)}
                  bad={bad.origin}
                  error={errText.origin ?? "Choose the departure airport"}
                  onPick={(place) => {
                    setOrigin(place?.iata ?? null)
                    if (place) remember(place)
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
                  valueLabel={placeLabel(destination ? places[destination] : undefined)}
                  bad={bad.dest}
                  error={errText.dest ?? "Choose the arrival airport"}
                  onPick={(place) => {
                    setDestination(place?.iata ?? null)
                    if (place) remember(place)
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
              {legs.map((leg, index) => (
                <div className="leg" key={index}>
                  <div className="leghead">
                    <span className="legtag">Flight {index + 1}</span>
                    {legs.length > MIN_LEGS && (
                      <button type="button" onClick={() => removeLeg(index)}>
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
                      valueLabel={placeLabel(leg.origin ? places[leg.origin] : undefined)}
                      onPick={(place) => {
                        setLeg(index, { origin: place?.iata ?? null })
                        if (place) remember(place)
                        clear("multi")
                      }}
                    />
                    <AirportField
                      id={`d${index}`}
                      label="To"
                      placeholder="Where to?"
                      value={leg.destination}
                      valueLabel={placeLabel(
                        leg.destination ? places[leg.destination] : undefined
                      )}
                      onPick={(place) => {
                        setLeg(index, { destination: place?.iata ?? null })
                        if (place) remember(place)
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
              ))}

              {legs.length < MAX_LEGS ? (
                <button className="addleg" type="button" onClick={addLeg}>
                  + Add another flight
                </button>
              ) : (
                <p className="subnote" style={{ marginTop: 12 }}>
                  {MAX_LEGS} flights is the most we can quote in one request. For a
                  longer trip, message us on WhatsApp.
                </p>
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
              <CountrySelect
                open={openPop === "cc"}
                onToggle={setOpenPop}
                value={country}
                localeTag={localeTag}
                onPick={(iso) => {
                  setCountry(iso)
                  clear("phone")
                }}
              />
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
              {toE164(dialCode, phone) ? (
                <>
                  {" "}
                  We will save it as <b className="mono">{toE164(dialCode, phone)}</b>.
                </>
              ) : null}
            </span>
            <span className="err">
              {errText.phone || "Enter a valid number, 6 to 15 digits"}
            </span>
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
        onClick={() => onToggle(open ? null : id)}
      >
        {icon && <span className="ic">{icon}</span>}
        <span>{label}</span>
        <span className="cr">
          <IcChevron />
        </span>
      </button>
      <div className="pop">{children}</div>
    </div>
  )
}

/**
 * O indicativo, com todos os países.
 *
 * A lista é pesquisável porque uma lista de 247 países sem pesquisa é uma lista
 * onde ninguém encontra nada, e a bandeira vem do código do país em vez de um
 * ficheiro de imagem por país. O que vai para o servidor é o ISO do país e não
 * só o indicativo: o +1 é de vinte países, e saber qual deles é decide o
 * mercado, a moeda e o método de pagamento que o cliente vê.
 */
function CountrySelect({
  open,
  onToggle,
  value,
  localeTag,
  onPick,
}: {
  open: boolean
  onToggle: (id: string | null) => void
  value: string
  localeTag: string
  onPick: (iso: string) => void
}) {
  const [query, setQuery] = useState("")
  const dial = COUNTRY_BY_ISO[value]?.dial ?? "+238"

  const results = useMemo(
    () => searchCountries(query, localeTag).slice(0, 60),
    [query, localeTag]
  )

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  return (
    <div className={`ccwrap sel${open ? " open" : ""}`}>
      <button
        type="button"
        className="ccbtn"
        aria-expanded={open}
        aria-label={`Country code · ${countryName(value, localeTag)}`}
        onClick={() => onToggle(open ? null : "cc")}
      >
        <span aria-hidden="true">{flagOf(value)}</span>
        <span>{dial}</span>
        <IcChevron />
      </button>
      <div className="pop scroll">
        <div style={{ padding: "6px 8px" }}>
          <input
            className="ccsearch"
            placeholder="Country or code"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {results.length === 0 && (
          <div style={{ padding: 10, fontSize: 13, color: "#64748B" }}>
            No country matches that.
          </div>
        )}
        {results.map((entry) => (
          <button
            key={entry.iso}
            className="opt"
            type="button"
            aria-checked={entry.iso === value}
            onClick={() => {
              onPick(entry.iso)
              onToggle(null)
            }}
          >
            <span className="ck">
              <IcTick />
            </span>
            <span className="tx">
              <span aria-hidden="true">{flagOf(entry.iso)}</span>{" "}
              <b className="mono" style={{ fontWeight: 600 }}>
                {entry.dial}
              </b>{" "}
              <span style={{ color: "#64748B" }}>
                {countryName(entry.iso, localeTag)}
              </span>
            </span>
          </button>
        ))}
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
          aria-label={`One fewer ${title.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span>{value}</span>
        <button
          type="button"
          aria-label={`One more ${title.toLowerCase()}`}
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
 * O campo de aeroporto, com sugestões vindas do catálogo completo.
 *
 * A lista de trinta aeroportos em duro desapareceu: as sugestões vêm de
 * `/api/airports`, que pesquisa nove mil e tolera acentos — "sao vicente"
 * encontra São Vicente. O pedido é atrasado 140 ms e o anterior é cancelado,
 * porque escrever "lisboa" são seis teclas e seriam seis pedidos.
 *
 * Um aeroporto meio escrito continua a não ser um aeroporto: ao sair do campo
 * sem ter escolhido da lista, o texto é limpo. Sem isso o cliente ficava
 * convencido de ter escrito "Lisboa" e o pedido seguia sem origem.
 */
function AirportField({
  id,
  label,
  placeholder,
  value,
  valueLabel,
  bad,
  error,
  onPick,
}: {
  id: string
  label: string
  placeholder: string
  value: string | null
  valueLabel: string
  bad?: boolean
  error?: string
  onPick: (place: Place | null) => void
}) {
  const [text, setText] = useState(valueLabel)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)

  /* O rótulo do valor escolhido pode chegar depois (rascunho recuperado). */
  useEffect(() => {
    setText(valueLabel)
  }, [valueLabel])

  const isSearch = Boolean(text.trim()) && text !== valueLabel

  useEffect(() => {
    if (!open) return
    const query = isSearch ? text.trim() : ""
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/airports?q=${encodeURIComponent(query)}&limit=8`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => setResults((json?.results ?? []) as Place[]))
        .catch(() => {
          /* pedido cancelado ou rede em baixo: fica a lista anterior */
        })
        .finally(() => setLoading(false))
    }, 140)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, open, isSearch])

  function choose(place: Place | undefined) {
    if (!place) return
    onPick(place)
    setText(`${place.city || place.name} (${place.iata})`)
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
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-sug`}
          aria-autocomplete="list"
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value)
            onPick(null)
            setOpen(true)
            setHighlight(-1)
          }}
          onBlur={() => {
            setOpen(false)
            setText(valueLabel)
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
            } else if (event.key === "Escape") {
              setOpen(false)
            }
          }}
        />
      </div>
      <div className="sug" id={`${id}-sug`} role="listbox">
        {!isSearch && <div className="sgh">Popular right now</div>}
        {results.length ? (
          results.map((place, index) => (
            <button
              key={place.iata}
              type="button"
              role="option"
              aria-selected={index === highlight}
              className={index === highlight ? "hl" : undefined}
              /* mousedown corre antes do blur do input, por isso a escolha
                 sobrevive; o click é a alternativa para teclado e leitores. */
              onMouseDown={(event) => {
                event.preventDefault()
                choose(place)
              }}
              onClick={(event) => {
                event.preventDefault()
                choose(place)
              }}
            >
              <span className="ia">{place.iata}</span>
              <span>
                <span className="ct">{place.city || place.name}</span>
                <span className="cy">
                  {place.countryName}
                  {place.city && place.name ? ` · ${place.name}` : ""}
                </span>
              </span>
            </button>
          ))
        ) : (
          <div style={{ padding: 10, fontSize: 13, color: "#64748B" }}>
            {loading ? "Searching…" : "No results. Try typing the city name."}
          </div>
        )}
      </div>
      {error && <span className="err">{error}</span>}
    </div>
  )
}
