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
 *
 * Sprint 3.1 · T-08 · e o texto também deixou de estar em duro.
 *
 * Esta era a metade por fechar do T-08: os ecrãs do link já liam do dicionário,
 * e este — o formulário público, que é o primeiro que qualquer cliente vê —
 * continuava escrito em inglês literal, incluindo as mensagens de erro. Um
 * vendedor mandava `/pc?lang=fr` a um cliente senegalês e o formulário abria em
 * inglês; o seletor de língua no topo mudava a barra e mais nada.
 *
 * Agora tudo o que o cliente lê vem de `pc.trip.*`, `pc.contact.*` e
 * `pc.review.*`. Os sub-componentes lá em baixo chamam `useT()` cada um por si
 * em vez de receberem o tradutor por prop: estão todos dentro do
 * `I18nProvider` que a página monta, e passar `t` por seis níveis de props era
 * ruído sem nada em troca.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { submitPcRequest } from "@/actions/pc"
import {
  CABINS,
  CURRENCIES,
  MAX_BAGGAGE,
  MAX_LEGS,
  MIN_LEGS,
  TRIPS,
  baggageLabel,
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
import {
  cabinLabel,
  daysBetween,
  fmtDate,
  paxFull,
  todayISO,
  tripLabel,
} from "@/lib/pc/format"
import {
  IcBag,
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
import { PcStepper, PcTopbar } from "@/components/pc/chrome"
import type { Locale } from "@/i18n/config"
import { useT } from "@/i18n/provider"

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
  initialLang: Locale
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
  const t = useT()
  const [pending, startTransition] = useTransition()

  /* FE-05 · três passos: viagem, contacto e a revisão antes de submeter. */
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // ── P1 ────────────────────────────────────────────────────────────────────
  const [trip, setTrip] = useState<TripKind>("round")
  const [cabin, setCabin] = useState<CabinKind>("economy")
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [infSeat, setInfSeat] = useState(0)
  const [infLap, setInfLap] = useState(0)
  /* VIP-10 · malas de porão. Zero é o valor por omissão e significa "não pediu
     nenhuma" — é uma resposta, não uma ausência de resposta. */
  const [baggage, setBaggage] = useState(0)
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

  /*
   * FE-05 · o campo dos pedidos especiais.
   *
   * "Não chegar de noite", "viajo com a minha mãe que anda de cadeira de
   * rodas", "tenho de estar em Lisboa antes das 14h". Nenhum formulário
   * estruturado apanha isto, e é isto que faz a cotação certa à primeira — daí
   * ser texto livre e não uma lista de caixas.
   */
  const [special, setSpecial] = useState("")

  // ── preferências do link ──────────────────────────────────────────────────
  const [lang, setLang] = useState<Locale>(initialLang)
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
  const localeTag = lang

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
          if (typeof d.baggage === "number") {
            setBaggage(Math.min(Math.max(d.baggage, 0), MAX_BAGGAGE))
          }
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
      trip, cabin, adults, children, infSeat, infLap, baggage,
      origin, destination, depart, ret, legs,
      name, phone, email, country,
    }
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* modo privado sem quota — o formulário continua a funcionar */
    }
  }, [trip, cabin, adults, children, infSeat, infLap, baggage, origin, destination,
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
            ? t("pc.trip.error.legOrder")
            : t("pc.trip.error.legIncomplete")
      }
    } else {
      if (!origin) nextBad.origin = true
      if (!destination) nextBad.dest = true
      if (origin && destination && origin === destination) {
        nextBad.dest = true
        nextErr.dest = t("pc.trip.error.sameAirport")
      }
      if (!depart || (trip === "round" && !ret)) {
        nextBad.dates = true
        nextErr.dates = t("pc.trip.error.dates")
      } else if (trip === "round" && ret < depart) {
        nextBad.dates = true
        nextErr.dates = t("pc.trip.error.returnBefore")
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

  /**
   * FE-05 · P2 → revisão.
   *
   * O que antes submetia passa a levar ao resumo. A validação é a mesma e corre
   * aqui, no fim do passo do contacto: chegar ao ecrã de revisão com um email
   * inválido seria pedir a alguém que confirmasse uma coisa que não se pode
   * enviar.
   */
  function review() {
    const nextBad: Record<string, boolean> = {}
    const nextErr: Record<string, string> = {}
    const cleanName = name.trim().replace(/\s+/g, " ")
    const e164 = toE164(dialCode, phone)

    if (cleanName.split(" ").filter(Boolean).length < 2) nextBad.name = true
    if (!e164) {
      nextBad.phone = true
      nextErr.phone = t("pc.contact.phoneErrorCountry")
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
    setStep(3)
    window.scrollTo(0, 0)
  }

  /**
   * FE-05 · a submissão, depois da confirmação explícita.
   *
   * "O pedido só é criado depois da confirmação explícita." É por isso que esta
   * função não valida nada: quem chega aqui já passou pelo `review`, e o que
   * falta é o gesto — não outra verificação.
   */
  function submit() {
    const cleanName = name.trim().replace(/\s+/g, " ")
    const e164 = toE164(dialCode, phone)

    setServerError(null)

    startTransition(async () => {
      const result = await submitPcRequest({
        trip,
        cabin,
        adults,
        children,
        infantsInSeat: infSeat,
        infantsOnLap: infLap,
        baggageHold: baggage,
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
        /* FE-05 · vazio vira ausente: a maioria não escreve nada, e uma string
           vazia guardada é um campo que parece respondido. */
        specialRequests: special.trim() || undefined,
        consent: true,
        locale: lang,
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
          ? `${fmtDate(depart, t)}–${fmtDate(ret, t)}`
          : fmtDate(depart, t)
        : "",
    paxFull(paxMix, t),
    cabinLabel(cabin, t),
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
          <span className="eyebrow">{t("pc.trip.eyebrow")}</span>
          <h1>{t("pc.trip.title")}</h1>
          <p>{t("pc.trip.lead")}</p>
        </section>

        <div className="card">
          <div className="selbar" id="pcTripBar">
            {/* tipo de viagem */}
            <Selector
              id="trip"
              open={openPop === "trip"}
              onToggle={setOpenPop}
              icon={<IcSwap size={17} />}
              label={tripLabel(trip, t)}
            >
              {(Object.keys(TRIPS) as TripKind[]).map((key) => (
                <button
                  key={key}
                  className="opt"
                  type="button"
                  role="menuitemradio"
                  aria-checked={key === trip}
                  onClick={() => {
                    setTrip(key)
                    setOpenPop(null)
                  }}
                >
                  <span className="ck">
                    <IcTick />
                  </span>
                  <span className="tx">{tripLabel(key, t)}</span>
                </button>
              ))}
            </Selector>

            {/* passageiros */}
            <div className={`sel${openPop === "pax" ? " open" : ""}`}>
              <button
                type="button"
                aria-expanded={openPop === "pax"}
                aria-label={t("pc.trip.pax.label", { summary: paxFull(paxMix, t) })}
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
                  title={t("pc.trip.pax.adults")}
                  note={t("pc.trip.pax.adultsNote")}
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
                  title={t("pc.trip.pax.children")}
                  note={t("pc.trip.pax.childrenNote")}
                  value={children}
                  min={0}
                  max={8}
                  onChange={setChildren}
                />
                <Counter
                  title={t("pc.trip.pax.infants")}
                  note={t("pc.trip.pax.infantsSeatNote")}
                  value={infSeat}
                  min={0}
                  max={4}
                  onChange={setInfSeat}
                />
                <Counter
                  title={t("pc.trip.pax.infants")}
                  note={t("pc.trip.pax.infantsLapNote")}
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
                    {t("pc.trip.pax.cancel")}
                  </button>
                  <button type="button" className="pri" onClick={() => setOpenPop(null)}>
                    {t("pc.trip.pax.done")}
                  </button>
                </div>
              </div>
            </div>

            {/* cabine */}
            <Selector
              id="cabin"
              open={openPop === "cabin"}
              onToggle={setOpenPop}
              label={cabinLabel(cabin, t)}
            >
              {(Object.keys(CABINS) as CabinKind[]).map((key) => (
                <button
                  key={key}
                  className="opt"
                  type="button"
                  role="menuitemradio"
                  aria-checked={key === cabin}
                  onClick={() => {
                    setCabin(key)
                    setOpenPop(null)
                  }}
                >
                  <span className="ck">
                    <IcTick />
                  </span>
                  <span className="tx">{cabinLabel(key, t)}</span>
                </button>
              ))}
            </Selector>

            {/* VIP-10 · bagagem.
                Perguntada aqui e não mais tarde porque muda o preço da tarifa
                que se vai procurar: cotar sem saber se há mala de porão é cotar
                a coisa errada e voltar a cotar depois. Vai para o contrato de
                campos e pré-preenche a proposta. */}
            <Selector
              id="baggage"
              open={openPop === "baggage"}
              onToggle={setOpenPop}
              icon={<IcBag size={17} />}
              label={baggageLabel(baggage, "hold", t)}
            >
              {Array.from({ length: MAX_BAGGAGE + 1 }, (_, n) => (
                <button
                  key={n}
                  className="opt"
                  type="button"
                  role="menuitemradio"
                  aria-checked={n === baggage}
                  onClick={() => {
                    setBaggage(n)
                    setOpenPop(null)
                  }}
                >
                  <span className="ck">
                    <IcTick />
                  </span>
                  <span className="tx">{baggageLabel(n, "hold", t)}</span>
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
                  label={t("pc.trip.fromLabel")}
                  placeholder={t("pc.trip.fromPlaceholder")}
                  value={origin}
                  valueLabel={placeLabel(origin ? places[origin] : undefined)}
                  bad={bad.origin}
                  error={errText.origin ?? t("pc.trip.error.origin")}
                  onPick={(place) => {
                    setOrigin(place?.iata ?? null)
                    if (place) remember(place)
                    clear("origin")
                  }}
                />
                <button
                  className="swap"
                  type="button"
                  title={t("pc.trip.swap")}
                  aria-label={t("pc.trip.swap")}
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
                  label={t("pc.trip.toLabel")}
                  placeholder={t("pc.trip.toPlaceholder")}
                  value={destination}
                  valueLabel={placeLabel(destination ? places[destination] : undefined)}
                  bad={bad.dest}
                  error={errText.dest ?? t("pc.trip.error.destination")}
                  onPick={(place) => {
                    setDestination(place?.iata ?? null)
                    if (place) remember(place)
                    clear("dest")
                  }}
                />
              </div>

              <div className={`datebox${trip === "oneway" ? " solo" : ""}${bad.dates ? " bad" : ""}`}>
                <div className="dcell">
                  <label htmlFor="dep">{t("pc.trip.departure")}</label>
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
                    <label htmlFor="ret">{t("pc.trip.return")}</label>
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
                  {t("pc.trip.nights", { count: nights })}
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
                    <span className="legtag">
                      {t("pc.trip.leg.title", { n: index + 1 })}
                    </span>
                    {legs.length > MIN_LEGS && (
                      <button type="button" onClick={() => removeLeg(index)}>
                        {t("pc.trip.leg.remove")}
                      </button>
                    )}
                  </div>
                  <div className="routebox">
                    <AirportField
                      id={`o${index}`}
                      label={t("pc.trip.fromLabel")}
                      placeholder={t("pc.trip.fromPlaceholder")}
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
                      label={t("pc.trip.toLabel")}
                      placeholder={t("pc.trip.toPlaceholder")}
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
                      <label htmlFor={`dt${index}`}>{t("pc.trip.date")}</label>
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
                  {t("pc.trip.leg.add")}
                </button>
              ) : (
                <p className="subnote" style={{ marginTop: 12 }}>
                  {t("pc.trip.leg.max", { count: MAX_LEGS })}
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
              {t("pc.trip.submit")}
              <IcNext />
            </button>
          </div>
          <p className="subnote">{t("pc.trip.footnote")}</p>
        </div>
        <div className="spacer" />
      </main>

      {/* ═══ P2 · contact details ═══ */}
      <main className="shell view" hidden={step !== 2}>
        <section className="hero">
          <span className="eyebrow">{t("pc.contact.eyebrow")}</span>
          <h1>{t("pc.contact.title")}</h1>
          <p>{recap || "—"}</p>
        </section>

        <div className="card">
          <div className={`f${bad.name ? " bad" : ""}`}>
            <label className="fl" htmlFor="fullname">
              {t("pc.contact.nameLabel")}
              <span className="req">*</span>
              {/* A dica que faz o passo 8 chegar já certo: um nome escrito
                  aqui como está no passaporte é um nome que não é preciso
                  corrigir depois de emitido. */}
              <span className="walabel"> · {t("pc.contact.nameHint")}</span>
            </label>
            <div className="inp">
              <span className="li">
                <IcUser />
              </span>
              <input
                id="fullname"
                placeholder={t("pc.contact.namePlaceholder")}
                autoComplete="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  clear("name")
                }}
              />
            </div>
            <span className="err">{t("pc.contact.nameError")}</span>
          </div>

          <div className={`f${bad.phone ? " bad" : ""}`} style={{ marginTop: 14 }}>
            <label className="fl" htmlFor="phone">
              {t("pc.contact.phoneLabel")}
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
                  placeholder={t("pc.contact.phonePlaceholder")}
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
            {/*
              Regra 4 · o número está dentro da frase, não colado ao fim dela.

              Eram duas cadeias com o `{phone}` pelo meio, e o meio de uma frase
              portuguesa não é o meio de uma frase francesa. São agora duas
              frases inteiras — uma para antes de haver número, outra para
              depois — e o número entra como marcador.
            */}
            <span className="hint">
              {toE164(dialCode, phone)
                ? t("pc.contact.phoneHintSaved", {
                    phone: toE164(dialCode, phone) ?? "",
                  })
                : t("pc.contact.phoneHint")}
            </span>
            <span className="err">
              {errText.phone || t("pc.contact.phoneError")}
            </span>
          </div>

          <div className={`f${bad.email ? " bad" : ""}`} style={{ marginTop: 14 }}>
            <label className="fl" htmlFor="email">
              {t("pc.contact.emailLabel")}
              <span className="req">*</span>
            </label>
            <div className="inp">
              <span className="li">
                <IcMail />
              </span>
              <input
                id="email"
                type="email"
                placeholder={t("pc.contact.emailPlaceholder")}
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  clear("email")
                }}
              />
            </div>
            <span className="err">{t("pc.contact.emailError")}</span>
          </div>

          {/*
            Sprint 3.1 · "Registamos a data, a hora e o dispositivo desta
            autorização" saiu do ecrã.

            O registo **não** saiu: a data, a hora e o dispositivo continuam a
            ser gravados exactamente como antes, em `actions/pc.ts`, porque é o
            que prova o consentimento. O que saiu é dizê-lo ao cliente. Era a
            linha mais comprida do ecrã, imediatamente por baixo de uma caixa
            que ele tem de marcar para continuar, e lia-se como vigilância no
            momento em que lhe estamos a pedir confiança.
          */}
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
            <p>{t("pc.contact.consent")}</p>
          </label>
          {bad.consent && (
            <span className="err" style={{ marginTop: 8, display: "block" }}>
              {t("pc.contact.consentError")}
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
              aria-label={t("pc.contact.back")}
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
              onClick={review}
            >
              {t("pc.contact.submit")}
            </button>
          </div>
        </div>
        <div className="spacer" />
      </main>

      {/*
        ═══ P3 · FE-05 · the review, before anything is created ═══

        The whole point of this screen is the last line of the requirement: the
        request is only created after an explicit confirmation. Everything above
        the button is correctable, and correcting one line does not lose the
        rest — going back to a step keeps the state, because the two other
        screens were never unmounted, only hidden.
      */}
      <main className="shell view" hidden={step !== 3}>
        <section className="hero">
          <span className="eyebrow">{t("pc.review.eyebrow")}</span>
          <h1>{t("pc.review.title")}</h1>
          <p>{t("pc.review.lead")}</p>
        </section>

        <div className="card">
          <ReviewRow
            label={t("pc.review.rowType")}
            value={tripLabel(trip, t)}
            onEdit={() => goToStep(1)}
          />
          <ReviewRow
            label={t("pc.review.rowRoute")}
            value={
              trip === "multi"
                ? legs
                    .filter((l) => l.origin && l.destination)
                    .map((l, i) =>
                      t("pc.review.leg", {
                        n: i + 1,
                        from: cityName(l.origin),
                        to: cityName(l.destination),
                      })
                    )
                    .join(" · ")
                : `${cityName(origin)} → ${cityName(destination)}`
            }
            onEdit={() => goToStep(1, trip === "multi" ? "o0" : "origin")}
          />
          <ReviewRow
            label={t("pc.review.rowDates")}
            value={
              trip === "multi"
                ? legs.map((l) => fmtDate(l.date, t)).filter(Boolean).join(" · ")
                : trip === "round" && ret
                  ? `${fmtDate(depart, t)} — ${fmtDate(ret, t)}`
                  : fmtDate(depart, t)
            }
            onEdit={() => goToStep(1, trip === "multi" ? "dt0" : "dep")}
          />
          <ReviewRow
            label={t("pc.review.rowPax")}
            value={paxFull(paxMix, t)}
            onEdit={() => goToStep(1, "pcTripBar")}
          />
          <ReviewRow
            label={t("pc.review.rowCabin")}
            value={cabinLabel(cabin, t)}
            onEdit={() => goToStep(1, "pcTripBar")}
          />
          <ReviewRow
            label={t("pc.review.rowBags")}
            value={
              baggage === 0
                ? t("pc.review.bagsNone")
                : t("pc.review.bagsPerPassenger", { count: baggage })
            }
            onEdit={() => goToStep(1, "pcTripBar")}
          />
          <ReviewRow
            label={t("pc.review.rowName")}
            value={name.trim().replace(/\s+/g, " ")}
            onEdit={() => goToStep(2, "fullname")}
          />
          <ReviewRow
            label={t("pc.review.rowPhone")}
            value={toE164(dialCode, phone) ?? `${dialCode} ${phone}`}
            onEdit={() => goToStep(2, "phone")}
          />
          <ReviewRow
            label={t("pc.review.rowEmail")}
            value={email.trim()}
            onEdit={() => goToStep(2, "email")}
          />

          {/*
            The free-text field. This is where "don't arrive at night",
            "travelling with my mother who needs a wheelchair" and "I must be in
            Lisbon before 2 pm" go — none of which any structured field catches,
            and all of which change the quote.
          */}
          <div className="f" style={{ marginTop: 18 }}>
            <label className="fl" htmlFor="special">
              {t("pc.review.specialLabel")}{" "}
              <span className="walabel">{t("pc.review.specialOptional")}</span>
            </label>
            <textarea
              id="special"
              rows={4}
              maxLength={1000}
              placeholder={t("pc.review.specialPlaceholder")}
              value={special}
              onChange={(event) => setSpecial(event.target.value)}
              style={{
                width: "100%",
                resize: "vertical",
                font: "inherit",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--line, #DFE5EC)",
                background: "#fff",
                color: "inherit",
              }}
            />
            <span className="hint">
              {t("pc.review.specialHint", { count: 1000 - special.length })}
            </span>
          </div>

          {serverError && (
            <span className="err" style={{ marginTop: 10, display: "block" }}>
              {serverError}
            </span>
          )}

          <div className="actions">
            <button
              className="btn btn-ghost"
              type="button"
              aria-label={t("pc.review.back")}
              onClick={() => goToStep(2)}
            >
              <IcBack />
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending}
              onClick={submit}
            >
              {pending ? t("pc.review.sending") : t("pc.review.submit")}
            </button>
          </div>
          <p className="subnote" style={{ marginTop: 10 }}>
            {t("pc.review.footnote")}
          </p>
        </div>
        <div className="spacer" />
      </main>
    </>
  )

  /**
   * FE-05 · "qualquer linha pode ser corrigida sem perder o resto".
   *
   * Voltar a um passo não desmonta nada: os três ecrãs existem sempre e é o
   * `hidden` que os esconde, por isso o estado sobrevive. O `id` opcional leva
   * o foco ao campo daquela linha — corrigir a data e ter de a procurar no
   * formulário inteiro seria metade da correção.
   */
  function goToStep(next: 1 | 2, focus?: string) {
    setStep(next)
    window.scrollTo(0, 0)
    if (!focus) return
    window.setTimeout(() => {
      const element = document.getElementById(focus)
      element?.scrollIntoView({ block: "center", behavior: "smooth" })
      if (element instanceof HTMLInputElement) element.focus({ preventScroll: true })
    }, 60)
  }
}

/** Uma linha do resumo: o que foi pedido, e um atalho para o corrigir. */
function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string
  value: string
  onEdit: () => void
}) {
  const t = useT()
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        padding: "11px 0",
        borderBottom: "1px solid var(--line-soft, #EDF1F5)",
      }}
    >
      <span style={{ minWidth: 104, fontSize: 12, opacity: 0.62 }}>{label}</span>
      <span style={{ flex: 1, fontWeight: 600 }}>{value || "—"}</span>
      <button
        type="button"
        onClick={onEdit}
        style={{
          border: 0,
          background: "none",
          font: "inherit",
          fontSize: 12.5,
          fontWeight: 600,
          color: "#EE5128",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        {t("pc.review.change")}
      </button>
    </div>
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
      {/* `menu` é o que faz o `aria-checked` das opções significar
          alguma coisa: num `button` sem papel, um leitor de ecrã ignora-o. */}
      <div className="pop" role="menu">
        {children}
      </div>
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
  const t = useT()
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
        aria-label={t("pc.contact.countryLabel", {
          country: countryName(value, localeTag),
        })}
        onClick={() => onToggle(open ? null : "cc")}
      >
        <span aria-hidden="true">{flagOf(value)}</span>
        <span>{dial}</span>
        <IcChevron />
      </button>
      <div className="pop scroll" role="menu">
        <div style={{ padding: "6px 8px" }}>
          <input
            className="ccsearch"
            placeholder={t("pc.contact.countrySearch")}
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {results.length === 0 && (
          <div style={{ padding: 10, fontSize: 13, color: "#64748B" }}>
            {t("pc.contact.countryNone")}
          </div>
        )}
        {results.map((entry) => (
          <button
            key={entry.iso}
            className="opt"
            type="button"
            role="menuitemradio"
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
  const t = useT()
  /* O tipo de passageiro entra no rótulo do botão como valor, e não colado a
     ele: "Menos um: bebés (ao colo)" precisa das duas metades para um leitor de
     ecrã distinguir os dois contadores de bebés. */
  const kind = `${title.toLowerCase()} (${note})`

  return (
    <div className="cnt">
      <div className="t">
        <b>{title}</b>
        <span>{note}</span>
      </div>
      <div className="stp2">
        <button
          type="button"
          aria-label={t("pc.trip.pax.fewer", { kind })}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span>{value}</span>
        <button
          type="button"
          aria-label={t("pc.trip.pax.more", { kind })}
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
  const t = useT()
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
        {!isSearch && <div className="sgh">{t("pc.trip.airport.popular")}</div>}
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
            {loading
              ? t("pc.trip.airport.searching")
              : t("pc.trip.airport.noResults")}
          </div>
        )}
      </div>
      {error && <span className="err">{error}</span>}
    </div>
  )
}
