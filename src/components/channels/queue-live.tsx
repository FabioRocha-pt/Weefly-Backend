"use client"

/**
 * B2G-12 · "Aparece na fila Ministérios da empresa e na fila do master, sem
 * recarregar, em menos de 5 segundos."
 *
 * As filas do terminal de vendas e o concierge do master vivem na moldura do
 * WeeFly Pro, que não tem o `BoLiveUpdates` do Concierge. Isto é o batimento
 * dele, sem a barra: de 4 em 4 segundos pede a assinatura a `/api/bo/pulse`
 * (da empresa da sessão, ou de todas com `workspace="all"` — que o servidor
 * só honra para o master) e, quando muda, `router.refresh()`. Como no
 * Concierge, o refresh espera que ninguém esteja a escrever num campo.
 */

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const PULSE_MS = 4_000

export function QueueLive({ workspace = "own", label }: { workspace?: "own" | "all"; label?: string }) {
  const router = useRouter()
  const signature = useRef<string | null>(null)
  const pending = useRef(false)

  useEffect(() => {
    let stopped = false
    const typing = () => {
      const el = document.activeElement as HTMLElement | null
      return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
    }
    const refresh = () => {
      if (typing()) {
        pending.current = true
        return
      }
      pending.current = false
      router.refresh()
    }
    const onBlur = () => {
      if (pending.current) refresh()
    }

    const beat = async () => {
      if (document.hidden) return
      try {
        const url = workspace === "all" ? "/api/bo/pulse?workspace=all" : "/api/bo/pulse"
        const response = await fetch(url, { cache: "no-store" })
        if (!response.ok || stopped) return
        const body = (await response.json()) as { signature?: string }
        if (!body.signature) return
        if (signature.current === null) {
          signature.current = body.signature
          return
        }
        if (signature.current !== body.signature) {
          signature.current = body.signature
          refresh()
        }
      } catch {
        /* a próxima passagem tenta outra vez */
      }
    }

    void beat()
    const interval = setInterval(beat, PULSE_MS)
    const onVisible = () => {
      if (!document.hidden) void beat()
    }
    document.addEventListener("visibilitychange", onVisible)
    document.addEventListener("focusout", onBlur)
    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      document.removeEventListener("focusout", onBlur)
    }
  }, [router, workspace])

  return label ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
      {label}
    </span>
  ) : null
}
