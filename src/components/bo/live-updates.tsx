"use client"

/**
 * BO-03 · a fila deixa de esperar por um F5.
 *
 * A regra que este ficheiro serve é uma só: o back-office reflete o que
 * aconteceu no caso em segundos, sem ninguém recarregar. E tem uma regra que
 * nunca pode quebrar por causa da primeira — **nada do que o agente está a
 * escrever se perde**. É por isso que o refresh espera pelo fim da escrita em
 * vez de acontecer no momento do evento.
 *
 * Como funciona:
 *
 *   · o Supabase Realtime traz o acontecimento (Postgres → websocket). Não é um
 *     temporizador: quando o cliente submete, escolhe, envia comprovativo ou
 *     cancela, a linha muda e o evento chega;
 *   · `router.refresh()` volta a correr os Server Components da página aberta e
 *     troca só o que mudou. O estado dos componentes de cliente — o texto do
 *     compositor, a pesquisa da fila — sobrevive, porque não é remontado;
 *   · se o websocket não subir (realtime desligado no projeto, rede a filtrar
 *     websockets), fica uma sondagem de 20 segundos. É a rede de segurança, não
 *     o mecanismo principal.
 *
 * O aviso sonoro é por agente e desliga-se com um clique: quem está ao balcão
 * com clientes à frente não quer um sino a cada pedido.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/utils/supabase/client"

/** As tabelas cuja mudança muda algum ecrã deste back-office. */
const TABLES = [
  "booking_cases",
  "trip_requests",
  "case_payments",
  "case_payment_proofs",
  "case_passengers",
  "case_proposals",
  "case_events",
]

const SOUND_KEY = "weefly.bo.sound"
const FALLBACK_MS = 20_000
const CONNECT_GRACE_MS = 8_000

interface Arrival {
  /** Quantos acontecimentos entraram desde o último olhar. */
  count: number
  /** Verdadeiro quando pelo menos um deles é um pedido novo. */
  fresh: boolean
}

export function BoLiveUpdates() {
  const router = useRouter()
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const [live, setLive] = useState(false)
  const [sound, setSound] = useState(true)

  /* Guardado por agente e não por conta: é uma preferência do sítio onde a
     pessoa está a trabalhar, e o balcão da Praia não tem o mesmo silêncio que
     uma secretária. */
  useEffect(() => {
    try {
      setSound(window.localStorage.getItem(SOUND_KEY) !== "off")
    } catch {
      /* sem storage, o som fica ligado */
    }
  }, [])

  const soundRef = useRef(sound)
  soundRef.current = sound

  const pendingRefresh = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * O refresh que espera pelo fim da frase.
   *
   * Enquanto o foco está num campo, o refresh fica marcado e não corre: em
   * teoria o estado local sobrevive a um `router.refresh()`, mas uma gravação
   * automática a acontecer no mesmo instante trocaria o que o servidor devolve
   * pelo que o agente ainda não gravou. Esperar dois segundos por uma tecla é
   * mais barato do que explicar um parágrafo perdido.
   */
  const refreshWhenIdle = useCallback(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      return (
        el.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
      )
    }

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (typing()) {
        pendingRefresh.current = true
        return
      }
      pendingRefresh.current = false
      router.refresh()
    }, 400)
  }, [router])

  /* O refresh adiado corre quando o campo perde o foco. */
  useEffect(() => {
    const onBlur = () => {
      if (!pendingRefresh.current) return
      pendingRefresh.current = false
      router.refresh()
    }
    document.addEventListener("focusout", onBlur)
    return () => document.removeEventListener("focusout", onBlur)
  }, [router])

  const announce = useCallback((isNewCase: boolean) => {
    setArrival((current) => ({
      count: (current?.count ?? 0) + 1,
      fresh: Boolean(current?.fresh) || isNewCase,
    }))
    if (isNewCase && soundRef.current) chime()
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let connected = false

    const channel = supabase.channel("bo-price-checker")

    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          announce(table === "booking_cases" && payload.eventType === "INSERT")
          refreshWhenIdle()
        }
      )
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        connected = true
        setLive(true)
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        connected = false
        setLive(false)
      }
    })

    /*
     * A rede de segurança. Se o websocket não estiver de pé oito segundos
     * depois de entrar, passa a haver uma sondagem — melhor uma fila com vinte
     * segundos de atraso do que uma fila parada sem ninguém saber.
     */
    let poll: ReturnType<typeof setInterval> | null = null
    const grace = setTimeout(() => {
      if (connected) return
      poll = setInterval(() => {
        if (connected) return
        refreshWhenIdle()
      }, FALLBACK_MS)
    }, CONNECT_GRACE_MS)

    return () => {
      clearTimeout(grace)
      if (poll) clearInterval(poll)
      if (timer.current) clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [announce, refreshWhenIdle])

  function toggleSound() {
    const next = !sound
    setSound(next)
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off")
    } catch {
      /* a preferência vale para esta sessão e mais nada */
    }
  }

  return (
    <div className="live" data-live={live ? "on" : "off"}>
      <button
        type="button"
        className="live-dot"
        onClick={toggleSound}
        title={
          live
            ? sound
              ? "Em tempo real, com aviso sonoro. Clique para silenciar."
              : "Em tempo real, silencioso. Clique para ligar o aviso."
            : "Sem ligação em tempo real — a fila atualiza a cada 20 segundos."
        }
      >
        <span className="dot" />
        {live ? "ao vivo" : "a sondar"}
        {!sound && <span className="muted-tag">silencioso</span>}
      </button>

      {arrival && (
        <button type="button" className="live-news" onClick={() => setArrival(null)}>
          {arrival.fresh
            ? arrival.count === 1
              ? "Entrou um pedido novo"
              : `${arrival.count} novidades, uma delas um pedido novo`
            : arrival.count === 1
              ? "Um caso mudou de estado"
              : `${arrival.count} casos mudaram de estado`}
          <span className="x" aria-hidden="true">
            ✕
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * O sino: dois tons curtos, feitos no browser.
 *
 * Sem ficheiro de áudio — um MP3 para 300 ms de som seria um pedido de rede e
 * uma dependência de asset por cada carregamento do back-office. Falha em
 * silêncio nos browsers que exigem um gesto antes de tocar, o que é a política
 * certa: o aviso visual já está no ecrã.
 */
function chime() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const now = ctx.currentTime

    for (const [at, hz] of [
      [0, 880],
      [0.14, 1174],
    ] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = hz
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(0.09, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.12)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.14)
    }

    setTimeout(() => void ctx.close(), 600)
  } catch {
    /* o aviso visual continua a valer */
  }
}
