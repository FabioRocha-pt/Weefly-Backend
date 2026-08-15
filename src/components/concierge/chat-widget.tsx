"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Loader2, Send, Sparkles, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  ChatProposal,
  type ProposalPayload,
} from "@/components/concierge/chat-proposal"
import { useT } from "@/i18n/provider"

const STORAGE_KEY = "weefly.conversation"

/** Enquanto o agente prepara a proposta, é a sondagem que a traz. */
const POLL_MS = 10_000

interface Message {
  id: string
  author: "client" | "bot" | "agent"
  kind: "text" | "proposal" | "link" | "system"
  body: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

const SUGGESTION_KEYS = [
  "chat.suggestion1",
  "chat.suggestion2",
  "chat.suggestion3",
]

/**
 * A conversa do WeeFly Concierge.
 *
 * Deixou de orquestrar: antes era este componente que chamava o parse, olhava
 * para `ready` e decidia se pesquisava voos. Agora envia a mensagem e mostra o
 * que vier — o histórico, o caso e a decisão de quando o pedido está completo
 * vivem no servidor, porque é lá que um agente também consegue escrever.
 *
 * O `token` guardado no browser é o que permite fechar o separador e voltar
 * dias depois à mesma conversa.
 */
export function ChatWidget({ token: initialToken }: { token?: string }) {
  const t = useT()
  const [token, setToken] = useState<string | null>(initialToken ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [awaitingAgent, setAwaitingAgent] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, busy])

  /** Carrega o histórico: o token vem do endereço ou do armazenamento local. */
  useEffect(() => {
    const stored =
      initialToken ??
      (typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null)

    if (!stored) {
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/chat/${stored}`, { cache: "no-store" })
        if (!res.ok) {
          // Conversa apagada ou token inválido — recomeça-se limpo em vez de
          // deixar o cliente preso num estado que já não existe.
          window.localStorage.removeItem(STORAGE_KEY)
          return
        }
        const data = (await res.json()) as {
          token: string
          caseId: string | null
          messages: Message[]
        }
        if (cancelled) return
        setToken(data.token)
        setMessages(data.messages)
        setAwaitingAgent(Boolean(data.caseId))
        window.localStorage.setItem(STORAGE_KEY, data.token)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [initialToken])

  /**
   * Sondagem, mas só quando há motivo.
   *
   * Enquanto o bot está a fazer perguntas, tudo o que aparece é resposta do
   * próprio turno e não há nada a sondar. Depois de o pedido ser entregue, o
   * que falta chega de fora — do agente — e só aí vale a pena perguntar.
   */
  const poll = useCallback(async () => {
    if (!token) return
    const since = messages[messages.length - 1]?.created_at
    const url = `/api/chat/${token}${since ? `?since=${encodeURIComponent(since)}` : ""}`
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as { messages: Message[] }
      if (data.messages.length > 0) {
        setMessages((prev) => merge(prev, data.messages))
      }
    } catch {
      // Rede a falhar durante a sondagem não é digno de interromper ninguém.
    }
  }, [token, messages])

  useEffect(() => {
    if (!awaitingAgent || !token) return
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [awaitingAgent, token, poll])

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy) return

    setInput("")
    setBusy(true)

    // Eco imediato: o cliente vê o que escreveu antes de a rede responder.
    const pendingId = `pending-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        author: "client",
        kind: "text",
        body: text,
        payload: null,
        created_at: new Date().toISOString(),
      },
    ])

    try {
      const res = await fetch("/api/chat/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: text }),
      })

      if (!res.ok) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== pendingId),
          {
            id: pendingId,
            author: "client",
            kind: "text",
            body: text,
            payload: null,
            created_at: new Date().toISOString(),
          },
          {
            id: `err-${Date.now()}`,
            author: "bot",
            kind: "text",
            body: t("chat.sendFailed"),
            payload: null,
            created_at: new Date().toISOString(),
          },
        ])
        return
      }

      const data = (await res.json()) as {
        token: string
        messages: Message[]
        caseCreated: { caseId: string } | null
      }

      setToken(data.token)
      window.localStorage.setItem(STORAGE_KEY, data.token)
      setMessages((prev) =>
        merge(
          prev.filter((m) => m.id !== pendingId),
          data.messages
        )
      )
      if (data.caseCreated) setAwaitingAgent(true)
    } finally {
      setBusy(false)
    }
  }

  const showGreeting = !loading && messages.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        )}

        {showGreeting && (
          <>
            <Bubble author="bot">{t("chat.greeting")}</Bubble>
            <div className="flex flex-wrap gap-2 pl-9">
              {SUGGESTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => send(t(key))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}

        {busy && (
          <Bubble author="bot">
            <span className="inline-flex items-center gap-2 text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("chat.writing")}
            </span>
          </Bubble>
        )}

        {awaitingAgent && !busy && (
          <p className="px-1 py-2 text-center text-[12px] leading-relaxed text-slate-400">
{t("chat.awaitingAgent")}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-end gap-2 border-t border-slate-200 bg-white pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat.placeholder")}
          disabled={busy}
          className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-3 text-[14px] outline-none transition-colors placeholder:text-slate-400 focus:border-orange-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label={t("chat.sendLabel")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white transition-colors hover:bg-orange-700 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

/** Junta mensagens novas sem duplicar as que já estavam. */
function merge(previous: Message[], incoming: Message[]): Message[] {
  const seen = new Set(previous.map((m) => m.id))
  return [...previous, ...incoming.filter((m) => !seen.has(m.id))]
}

function MessageRow({ message }: { message: Message }) {
  const t = useT()

  if (message.kind === "system") {
    return (
      <p className="py-1 text-center text-[12px] text-slate-400">
        {message.body}
      </p>
    )
  }

  if (message.kind === "proposal") {
    return (
      <div className="space-y-2">
        {message.body && <Bubble author="agent">{message.body}</Bubble>}
        <div className="pl-9">
          <ChatProposal payload={message.payload as unknown as ProposalPayload} />
        </div>
      </div>
    )
  }

  if (message.kind === "link") {
    const payload = (message.payload ?? {}) as { url?: string; label?: string }
    return (
      <Bubble author={message.author}>
        {message.body}
        {payload.url && (
          <a
            href={payload.url}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-orange-700"
          >
            {payload.label ?? t("common.open")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </Bubble>
    )
  }

  return <Bubble author={message.author}>{message.body}</Bubble>
}

/**
 * O cliente tem direito a saber com quem fala.
 *
 * O assistente e o agente humano têm avatares e rótulos diferentes de
 * propósito: a diferença entre "o robô percebeu-me mal" e "a Nélida disse-me
 * isto" muda completamente o que a pessoa faz a seguir.
 */
function Bubble({
  author,
  children,
}: {
  author: "client" | "bot" | "agent"
  children: React.ReactNode
}) {
  const t = useT()

  if (author === "client") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-orange-600 px-4 py-2.5 text-[14px] leading-relaxed text-white">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          author === "agent"
            ? "bg-slate-900 text-white"
            : "bg-orange-100 text-orange-600"
        )}
        aria-hidden
      >
        {author === "agent" ? (
          <UserRound className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="max-w-[85%]">
        {author === "agent" && (
          <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            {t("chat.agentLabel")}
          </span>
        )}
        <div className="rounded-2xl rounded-tl-md bg-slate-100 px-4 py-2.5 text-[14px] leading-relaxed text-slate-800">
          {children}
        </div>
      </div>
    </div>
  )
}
