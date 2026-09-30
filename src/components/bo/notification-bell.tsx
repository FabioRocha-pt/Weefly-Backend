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
 *   · PRO-11 · **abrir o painel não marca nada**. Cada aviso fica lido quando
 *     se clica nele, o contador desce um a um, e os lidos ficam no painel,
 *     esbatidos, até alguém os limpar;
 *   · PRO-12 · "Marcar todas como lidas" e "Limpar" (tira os lidos), as duas
 *     com confirmação;
 *   · **o contador actualiza sem recarregar a página** — o `BoLiveUpdates` já
 *     chama `router.refresh()` quando a base muda, e isto lê do servidor. Não
 *     há aqui temporizador nenhum, de propósito: um segundo relógio ao lado do
 *     que já existe eram dois sítios a discordar sobre quando actualizar.
 */

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import type { BoAlert } from "@/lib/bo-alerts"
import {
  boClearReadAlerts,
  boMarkAlertsRead,
  boMarkAllAlertsRead,
} from "@/actions/bo-price-checker"
import { useI18n } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateOr } from "@/i18n/translate"

/* O que cada acontecimento é, escrito para quem atende: `bo.shell.alerts.kind.<kind>`. */

const when = (iso: string, tag: string) =>
  new Date(iso).toLocaleString(tag, {
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
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  /* O que foi lido neste separador e o servidor ainda não devolveu. Faz o
     contador descer no próprio clique, sem esperar pelo refresh. */
  const [readHere, setReadHere] = useState<Set<string>>(() => new Set())
  /* PRO-12 · a acção à espera de confirmação, se alguma. */
  const [asking, setAsking] = useState<"all" | "clear" | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  /* Quando o servidor devolve a lista nova, as marcas locais já lá estão. */
  useEffect(() => {
    setReadHere(new Set())
  }, [alerts])

  const isUnread = (alert: BoAlert) => alert.unread && !readHere.has(alert.id)
  const unreadNow = Math.max(
    0,
    unread - alerts.filter((a) => a.unread && readHere.has(a.id)).length
  )
  const readCount = alerts.filter((a) => !isUnread(a)).length

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

  /*
   * PRO-11 · abrir **não** marca nada.
   *
   * Marcava, com a ideia de que abrir era ler. Com 40 avisos, abrir o painel
   * fazia-os desaparecer todos de uma vez — e um pedido novo ou um comprovativo
   * ficava invisível sem ninguém dar por isso. Lido é o que se clicou.
   */
  function toggle() {
    setOpen((was) => !was)
    setAsking(null)
    setNotice(null)
  }

  function readOne(alert: BoAlert) {
    setOpen(false)
    if (!isUnread(alert)) return
    setReadHere((prev) => new Set(prev).add(alert.id))
    startTransition(async () => {
      await boMarkAlertsRead(alert.eventIds)
      router.refresh()
    })
  }

  function confirmAsked() {
    const action = asking
    setAsking(null)
    if (!action) return
    startTransition(async () => {
      const result =
        action === "all" ? await boMarkAllAlertsRead() : await boClearReadAlerts()
      setNotice(result.ok ? (result.notice ?? null) : result.error)
      router.refresh()
    })
  }

  return (
    <div className="who-menu" ref={box}>
      <button
        ref={trigger}
        className="bell"
        title={
          unreadNow > 0
            ? t("bo.shell.alerts.unseenTitle", { count: unreadNow })
            : t("bo.shell.alerts.title")
        }
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
        {unreadNow > 0 && (
          <span className="bell-n">{unreadNow > 99 ? "99+" : unreadNow}</span>
        )}
      </button>

      {open && (
        <div className="who-pop alerts" role="menu">
          <div className="who-head">
            <b>{t("bo.shell.alerts.title")}</b>
            <span className="mono">
              {alerts.length === 0
                ? t("bo.shell.alerts.nothing")
                : t("bo.shell.alerts.summary", { total: alerts.length, unseen: unreadNow })}
            </span>
            {alerts.length > 0 && (
              <div className="alert-actions">
                {asking ? (
                  <>
                    <span>
                      {asking === "all"
                        ? t("bo.shell.alerts.confirmAll", { count: unreadNow })
                        : t("bo.shell.alerts.confirmClear", { count: readCount })}
                    </span>
                    <button type="button" disabled={pending} onClick={confirmAsked}>
                      {t("bo.shell.alerts.yes")}
                    </button>
                    <button type="button" onClick={() => setAsking(null)}>
                      {t("bo.shell.alerts.no")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={pending || unreadNow === 0}
                      onClick={() => setAsking("all")}
                    >
                      {t("bo.shell.alerts.markAll")}
                    </button>
                    <button
                      type="button"
                      disabled={pending || readCount === 0}
                      onClick={() => setAsking("clear")}
                    >
                      {t("bo.shell.alerts.clearRead")}
                    </button>
                  </>
                )}
              </div>
            )}
            {notice && <span className="alert-notice">{notice}</span>}
          </div>

          {alerts.length === 0 ? (
            <p className="alert-empty">
              {t("bo.shell.alerts.empty")}
            </p>
          ) : (
            <div className="alert-list">
              {alerts.map((alert) => (
                <Link
                  key={alert.id}
                  role="menuitem"
                  className={`alert-row${isUnread(alert) ? " unread" : " read"}`}
                  href={`/admin/price-checker/${alert.caseId}`}
                  onClick={() => readOne(alert)}
                >
                  <b>
                    {translateOr(t, `bo.shell.alerts.kind.${alert.kind}`, alert.title)}
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
                    {when(alert.createdAt, LOCALE_TAGS[locale])}
                    {" · "}
                    {/* Quem o provocou. Um acontecimento do cliente não tem
                        email — tem o cliente, e dizer "sistema" ali era mentir
                        sobre quem agiu. */}
                    {alert.actorKind === "client"
                      ? (alert.clientName ?? t("bo.shell.alerts.actorClient"))
                      : alert.actorKind === "system"
                        ? t("bo.shell.alerts.actorSystem")
                        : (alert.actorEmail ?? t("bo.shell.alerts.actorTeam"))}
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
