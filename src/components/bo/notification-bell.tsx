"use client"

/**
 * C-14 · a campainha, a funcionar.
 *
 * Era um `<button>` com um ícone de campainha e mais nada: sem contador, sem
 * `onClick`, sem lista. O teste registou-a como um botão que não faz nada, e é
 * a mesma doença do C-13 — um botão morto ensina a não confiar no resto.
 *
 * Os seis critérios, e onde cada um está:
 *
 *   · **contador real de não lidos** — vem do servidor (`loadBoAlerts`), não de
 *     estado local. O ponto vermelho só existe se houver número;
 *   · **abre a lista, do mais recente para o mais antigo** — a ordem vem da
 *     query, não de um `sort` no browser;
 *   · **o que aconteceu, que caso, quando, e quem o provocou** — as quatro
 *     linhas de cada entrada;
 *   · **clicar abre o caso** — cada entrada é um `<Link>`, não um `onClick` com
 *     `router.push`: abre num separador novo com o meio-clique, como qualquer
 *     link, o que é o gesto de quem trabalha uma fila;
 *   · **lido e não lido persistem por utilizador** — `bo_alert_reads`, uma linha
 *     por par pessoa/acontecimento (migração 0016);
 *   · **o contador actualiza sem recarregar a página** — o `BoLiveUpdates` já
 *     chama `router.refresh()` quando a base muda, e isto lê do servidor. Não
 *     há aqui temporizador nenhum, de propósito: um segundo relógio ao lado do
 *     que já existe eram dois sítios a discordar sobre quando actualizar.
 */

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import type { BoAlert } from "@/lib/bo-alerts"
import { boMarkAlertsRead } from "@/actions/bo-price-checker"

/** O que cada acontecimento é, escrito para quem atende. */
const ALERT_LABEL: Record<string, string> = {
  request_submitted: "Pedido novo submetido",
  offer_selected: "O cliente escolheu uma opção",
  passengers_submitted: "Passaportes submetidos",
  pay_method_chosen: "O cliente escolheu como pagar",
  proof_uploaded: "Comprovativo enviado",
  client_declared_paid: "O cliente diz que pagou",
  request_cancelled: "O cliente cancelou o pedido",
  payment_expired: "O prazo de pagamento expirou",
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Cape_Verde",
  })

export function BoNotificationBell({
  alerts,
  unread,
}: {
  alerts: BoAlert[]
  unread: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  /* Fechar: clique fora e Escape. O foco volta ao botão, porque quem navega por
     teclado ficava de outra forma no fim da página — o mesmo que o menu da
     conta faz (ver `user-menu.tsx`). */
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      trigger.current?.focus()
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function toggle() {
    const next = !open
    setOpen(next)

    /*
     * Marcar como visto ao **abrir**, e não ao clicar numa entrada.
     *
     * Abrir a campainha é o gesto de as ler: quem a abre vê as dez linhas de
     * uma vez. Marcar só a que ele clica deixaria as outras nove a contar para
     * sempre, e o contador passaria a ser um número que nunca desce.
     */
    if (!next) return
    const fresh = alerts.filter((a) => a.unread).map((a) => a.id)
    if (fresh.length === 0) return

    startTransition(async () => {
      await boMarkAlertsRead(fresh)
      router.refresh()
    })
  }

  return (
    <div className="who-menu" ref={box}>
      <button
        ref={trigger}
        className="bell"
        title={unread > 0 ? `${unread} avisos por ver` : "Avisos"}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <path
            d="M9 2.5a4.2 4.2 0 00-4.2 4.2c0 3.3-1.3 4.6-1.3 4.6h11c0-.1-1.3-1.3-1.3-4.6A4.2 4.2 0 009 2.5zM7.4 13.8a1.7 1.7 0 003.2 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {/* O contador só existe quando há alguma coisa para contar. Um "0"
            pendurado é ruído com a forma de informação. */}
        {unread > 0 && <span className="bell-n">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="who-pop alerts" role="menu">
          <div className="who-head">
            <b>Avisos</b>
            <span className="mono">
              {alerts.length === 0
                ? "nada por agora"
                : `${alerts.length} · ${unread} por ver`}
            </span>
          </div>

          {alerts.length === 0 ? (
            <p className="alert-empty">
              Quando um cliente escolher uma opção, submeter passaportes ou
              enviar um comprovativo, aparece aqui.
            </p>
          ) : (
            <div className="alert-list">
              {alerts.map((alert) => (
                <Link
                  key={alert.id}
                  role="menuitem"
                  className={`alert-row${alert.unread ? " unread" : ""}`}
                  href={`/admin/price-checker/${alert.caseId}`}
                  onClick={() => setOpen(false)}
                >
                  <b>
                    {ALERT_LABEL[alert.kind] ?? alert.title}
                    {/* Repetições colapsadas numa linha. Ver `loadBoAlerts`. */}
                    {alert.repeated > 1 && (
                      <span className="alert-x"> ×{alert.repeated}</span>
                    )}
                  </b>
                  <span className="alert-case">
                    {alert.reference ?? "—"}
                    {alert.clientName ? ` · ${alert.clientName}` : ""}
                  </span>
                  <span className="alert-meta">
                    {when(alert.createdAt)}
                    {" · "}
                    {/* Quem o provocou. Um acontecimento do cliente não tem
                        email — tem o cliente, e dizer "sistema" ali era mentir
                        sobre quem agiu. */}
                    {alert.actorKind === "client"
                      ? (alert.clientName ?? "o cliente")
                      : alert.actorKind === "system"
                        ? "automático"
                        : (alert.actorEmail ?? "equipa")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
