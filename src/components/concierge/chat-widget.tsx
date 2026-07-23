"use client"

import { useEffect, useRef, useState } from "react"
import { Send, Loader2, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ParsedFlightQuery } from "@/lib/flight-parse"
import type { FlightSearchResponse, FormattedFlightOffer } from "@/types/flights"
import { FlightOfferCard } from "@/components/concierge/flight-offer-card"

const EMBER = "#FF4747"

// --- Message model ----------------------------------------------------------

type ChatRole = "user" | "assistant"

type TextMessage = { id: string; role: ChatRole; type: "text"; text: string }
type LoadingMessage = { id: string; role: "assistant"; type: "loading"; text: string }
type OffersMessage = {
  id: string
  role: "assistant"
  type: "offers"
  result: FlightSearchResponse
}
type ChatMessage = TextMessage | LoadingMessage | OffersMessage

const SUGGESTIONS = [
  "Voos de Lisboa para Paris dia 15",
  "Praia para Lisboa, ida e volta próxima semana, 2 adultos",
  "Quero voar para Londres em classe executiva",
]

let idCounter = 0
const uid = () => `m${Date.now()}-${idCounter++}`

export function ChatWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  function addMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message])
  }

  async function handleSend(raw: string) {
    const text = raw.trim()
    if (!text || busy) return

    // Snapshot prior text turns as history for multi-turn slot-filling.
    const history = messages
      .filter((m): m is TextMessage => m.type === "text")
      .map((m) => ({ role: m.role, content: m.text }))

    addMessage({ id: uid(), role: "user", type: "text", text })
    setInput("")
    setBusy(true)

    try {
      // 1) NLP: turn free text into a structured query.
      const parseRes = await fetch("/api/chat/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      })
      const parseData = (await parseRes.json().catch(() => null)) as
        | (ParsedFlightQuery & { error?: string })
        | { error?: string; reply?: string }
        | null

      const reply =
        parseData && typeof parseData.reply === "string"
          ? parseData.reply
          : "Desculpe, não consegui interpretar o pedido. Pode indicar a origem, o destino e a data?"

      addMessage({ id: uid(), role: "assistant", type: "text", text: reply })

      const query = parseData as ParsedFlightQuery | null
      const canSearch =
        !!query &&
        query.ready === true &&
        !!query.origin &&
        !!query.destination &&
        !!query.departDate

      if (!canSearch) return

      // 2) Search flights and render the offer cards.
      const loadingId = uid()
      addMessage({
        id: loadingId,
        role: "assistant",
        type: "loading",
        text: "A procurar as melhores tarifas…",
      })

      const searchRes = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: query.origin,
          destination: query.destination,
          departDate: query.departDate,
          returnDate: query.returnDate,
          adults: query.adults,
          children: query.children,
          infants: query.infants,
          cabinClass: query.cabinClass,
        }),
      })

      setMessages((prev) => prev.filter((m) => m.id !== loadingId))

      if (!searchRes.ok) {
        addMessage({
          id: uid(),
          role: "assistant",
          type: "text",
          text: "Não consegui pesquisar voos neste momento. Tente novamente daqui a pouco.",
        })
        return
      }

      const result = (await searchRes.json()) as FlightSearchResponse
      if (result.offers.length === 0) {
        addMessage({
          id: uid(),
          role: "assistant",
          type: "text",
          text: "Não encontrei voos para esta pesquisa. Quer tentar outras datas?",
        })
        return
      }

      addMessage({ id: uid(), role: "assistant", type: "offers", result })
    } catch {
      addMessage({
        id: uid(),
        role: "assistant",
        type: "text",
        text: "Ocorreu um erro inesperado. Pode tentar novamente?",
      })
    } finally {
      setBusy(false)
    }
  }

  function handleBook(offer: FormattedFlightOffer) {
    addMessage({
      id: uid(),
      role: "assistant",
      type: "text",
      text: `Perfeito! Reservei a opção de ${offer.price.label}. Um consultor WeeFly vai confirmar os detalhes consigo. (demonstração)`,
    })
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
      {/* Conversation */}
      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 py-5 sm:px-6",
          isEmpty ? "min-h-[220px]" : "min-h-[360px] max-h-[520px]"
        )}
      >
        {isEmpty ? (
          <EmptyState onPick={handleSend} disabled={busy} />
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onBook={handleBook}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend(input)
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex.: Voos de Lisboa para Paris dia 15…"
            disabled={busy}
            className="h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#FF4747] focus:bg-white focus:ring-2 focus:ring-[#FF4747]/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{ backgroundColor: EMBER }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enviar"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// --- Sub-components ----------------------------------------------------------

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "#FFECEC" }}
      >
        <Sparkles className="h-6 w-6" style={{ color: EMBER }} />
      </div>
      <p className="max-w-sm text-sm text-slate-500">
        Diga-me para onde quer voar. Trato da pesquisa e mostro-lhe as melhores
        opções.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#FF4747] hover:text-[#FF4747] disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onBook,
}: {
  message: ChatMessage
  onBook: (offer: FormattedFlightOffer) => void
}) {
  if (message.type === "offers") {
    return <OffersBlock result={message.result} onBook={onBook} />
  }

  if (message.type === "loading") {
    return (
      <div className="flex justify-start">
        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: EMBER }} />
          {message.text}
        </div>
      </div>
    )
  }

  const isUser = message.role === "user"
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-sm text-white"
            : "rounded-tl-sm bg-slate-100 text-slate-700"
        )}
        style={isUser ? { backgroundColor: EMBER } : undefined}
      >
        {message.text}
      </div>
    </div>
  )
}

function OffersBlock({
  result,
  onBook,
}: {
  result: FlightSearchResponse
  onBook: (offer: FormattedFlightOffer) => void
}) {
  const { cheapest, best, query, offers, source } = result

  // Cheapest first, then best — skip the duplicate when they're the same offer.
  const cards: { offer: FormattedFlightOffer; variant: "cheapest" | "best" }[] = []
  if (cheapest) cards.push({ offer: cheapest, variant: "cheapest" })
  if (best && best.id !== cheapest?.id) cards.push({ offer: best, variant: "best" })

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        {offers.length} opções encontradas · {query.origin} → {query.destination}
        {source === "mock" && " · demonstração"}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map(({ offer, variant }) => (
          <FlightOfferCard
            key={`${variant}-${offer.id}`}
            offer={offer}
            variant={variant}
            tripType={query.tripType}
            onBook={onBook}
          />
        ))}
      </div>
    </div>
  )
}
