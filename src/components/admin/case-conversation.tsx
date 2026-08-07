"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send, Sparkles, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"
import { sendAgentMessage } from "@/actions/conversations"
import type { ChatMessageRow } from "@/lib/conversations"

/**
 * A conversa do cliente, vista do back-office.
 *
 * Mostra o que o assistente e o cliente disseram um ao outro e deixa o agente
 * responder para dentro do mesmo fio. É a metade "manual" do fluxo meio
 * automático: o bot recolhe, a pessoa responde.
 */
export function CaseConversation({
  caseId,
  messages,
  conversationToken,
}: {
  caseId: string
  messages: ChatMessageRow[]
  conversationToken: string
}) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function send() {
    const text = body.trim()
    if (!text) return
    setError(null)
    startTransition(async () => {
      const result = await sendAgentMessage(caseId, text)
      if (result.error) setError(result.error)
      else {
        setBody("")
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-[13px] text-adm-muted">Ainda sem mensagens.</p>
        )}
        {messages.map((m) => (
          <Row key={m.id} message={m} />
        ))}
      </div>

      <div className="border-t border-adm-line-soft pt-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
          }}
          placeholder="Escrever ao cliente… (Ctrl+Enter envia)"
          className="min-h-[70px] w-full resize-y rounded-lg border border-adm-line bg-adm-bg p-2.5 text-[13px] leading-relaxed text-adm-txt outline-none transition-colors placeholder:text-adm-muted focus:border-adm-ember"
        />
        {error && (
          <p className="mt-2 text-[12px] text-adm-ember">{error}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={send}
            disabled={pending || !body.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-adm-ember px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar
          </button>
          <a
            href={`/c/${conversationToken}`}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-medium text-adm-muted transition-colors hover:text-adm-txt-2"
          >
            Ver como o cliente
          </a>
        </div>
      </div>
    </div>
  )
}

function Row({ message }: { message: ChatMessageRow }) {
  if (message.kind === "system") {
    return (
      <p className="py-0.5 text-center text-[11.5px] text-adm-muted">
        {message.body}
      </p>
    )
  }

  if (message.kind === "proposal") {
    const payload = (message.payload ?? {}) as { revision?: number }
    return (
      <p className="rounded-lg bg-adm-ok/10 px-3 py-2 text-[12px] text-adm-ok">
        Proposta R{payload.revision ?? 1} entregue na conversa.
      </p>
    )
  }

  const isClient = message.author === "client"

  return (
    <div className={cn("flex gap-2", isClient ? "" : "justify-end")}>
      {isClient && (
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-adm-raise text-[10px] font-bold text-adm-txt-2"
          aria-hidden
        >
          C
        </span>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
          isClient
            ? "bg-adm-panel-2 text-adm-txt"
            : message.author === "agent"
              ? "bg-adm-ember/15 text-adm-txt"
              : "bg-adm-raise text-adm-txt-2"
        )}
      >
        {!isClient && (
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-adm-muted">
            {message.author === "agent" ? (
              <>
                <UserRound className="h-3 w-3" /> Agente
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" /> Assistente
              </>
            )}
          </span>
        )}
        {message.body}
      </div>
    </div>
  )
}
