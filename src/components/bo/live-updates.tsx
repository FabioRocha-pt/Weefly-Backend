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
 *   · T-03 · **e há sempre um batimento de 4 segundos**, corra o websocket ou
 *     não. Era uma sondagem de 20 segundos que só arrancava quando o websocket
 *     falhava a subir — e o modo de falha real é outro: ele diz `SUBSCRIBED` e
 *     depois não entrega nada, o que do lado do código parece estar tudo bem.
 *     O batimento pede uma assinatura curta a `/api/bo/pulse` e só manda
 *     renderizar quando ela muda.
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

/**
 * T-03 · "cada acção do cliente aparece no back-office em 5 segundos, sem
 * recarregar".
 *
 * A sondagem passa de 20 para 4 segundos e deixa de esperar pelo Realtime — a
 * rede de segurança está sempre de pé, porque foi precisamente ela que não
 * estava quando o teste correu. Quatro e não cinco para que o atraso máximo
 * (uma passagem inteira mais o tempo de render) caiba dentro do critério.
 *
 * O custo é um pedido a `/api/bo/pulse` de quatro em quatro segundos, que
 * devolve uma linha de texto. O `router.refresh()` — esse sim caro — só corre
 * quando a assinatura muda.
 */
const PULSE_MS = 4_000

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
        setLive(true)
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setLive(false)
      }
    })

    return () => {
      if (timer.current) clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [announce, refreshWhenIdle])

  /*
   * T-03 · o batimento, a correr sempre.
   *
   * Estava condicionado a o websocket **não** ter subido em oito segundos. Essa
   * condição é a razão de o teste ter encontrado um back-office parado: quando
   * o Realtime diz `SUBSCRIBED` e depois não entrega nada — publicação sem a
   * tabela, RLS a filtrar, um proxy a matar o socket em silêncio — a sondagem
   * nunca chegava a arrancar, porque do ponto de vista do código estava tudo
   * bem.
   *
   * Agora corre sempre. Custa um pedido de quatro em quatro segundos que
   * devolve uma linha de texto; o render novo só acontece quando essa linha
   * muda, venha a notícia por websocket ou por aqui.
   */
  const signature = useRef<string | null>(null)

  useEffect(() => {
    let stopped = false

    const beat = async () => {
      /* Um separador em segundo plano não precisa de saber de nada: o
         `visibilitychange` traz o estado ao voltar. */
      if (document.hidden) return
      try {
        const response = await fetch("/api/bo/pulse", { cache: "no-store" })
        if (!response.ok || stopped) return
        const body = (await response.json()) as { signature?: string }
        if (!body.signature) return

        if (signature.current === null) {
          signature.current = body.signature
          return
        }
        if (signature.current !== body.signature) {
          signature.current = body.signature
          announce(false)
          refreshWhenIdle()
        }
      } catch {
        /* Rede a falhar: a próxima passagem tenta outra vez. Um back-office sem
           ligação já tem outros sinais disso. */
      }
    }

    void beat()
    const interval = setInterval(beat, PULSE_MS)
    const onVisible = () => {
      if (!document.hidden) void beat()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
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
            : "Sem websocket — a fila continua a actualizar a cada 4 segundos."
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
