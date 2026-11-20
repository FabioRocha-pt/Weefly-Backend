"use client"

/**
 * FILA-02 · as cores do tempo de espera, vivas.
 *
 * "As cores mudam sozinhas, sem recarregar a página." Um pedido que entrou há
 * 59 minutos passa a laranja um minuto depois, com a página parada: por isso a
 * cor é calculada no browser, por um relógio que bate de meio em meio minuto,
 * e não no HTML que o servidor mandou.
 *
 *   · `WaitRow`       · a linha da fila (`<tr>`), com a cor de fundo e a margem;
 *   · `WaitBadge`     · a etiqueta com o nome e o tempo escrito: "a cor nunca
 *                       aparece sozinha";
 *   · `WaitFilter`    · "os críticos podem ser filtrados";
 *   · `WaitByCompany` · "o master vê quantos há em cada empresa".
 *
 * A regra (os limites, quando conta) está em `lib/queue-wait`.
 */

import { useEffect, useState } from "react"
import Link from "next/link"

import { WAIT_STYLE, waitAgo, waitLevel, type WaitLevel } from "@/lib/queue-wait"
import { useT } from "@/i18n/provider"

const TICK_MS = 30_000

/** O instante de agora, actualizado sozinho. Um relógio por componente chega:
    são dezenas de linhas, não milhares. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    const onVisible = () => {
      if (!document.hidden) setNow(Date.now())
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])
  return now
}

const levelAt = (since: string | null | undefined, now: number): WaitLevel | null =>
  since ? waitLevel(Math.max(0, now - Date.parse(since))) : null

/**
 * A linha da fila. `since` nulo = a entrada não espera por nada (fechada,
 * emitida, cancelada) e não leva cor.
 */
export function WaitRow({
  since,
  className,
  children,
}: {
  since: string | null
  className?: string
  children: React.ReactNode
}) {
  const now = useNow()
  const level = levelAt(since, now)
  const look = level ? WAIT_STYLE[level] : null
  return (
    <tr
      className={className}
      data-wait={level ?? "none"}
      suppressHydrationWarning
      style={
        look
          ? { backgroundColor: look.row, boxShadow: `inset ${level === "critical" ? 4 : 3}px 0 0 ${look.edge}` }
          : undefined
      }
    >
      {children}
    </tr>
  )
}

/** O ícone do crítico: um triângulo de aviso, desenhado aqui para servir às
    duas folhas de estilo (a do Concierge não tem a biblioteca de ícones). */
function CriticalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <path d="M8 1.8 15 14H1L8 1.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 6.4v3.4M8 11.8v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * A etiqueta: o nome do nível e o tempo escrito ("A aguardar", "há 2 h"). É o
 * que se lê sem distinguir cores, e o que sai na impressão.
 */
export function WaitBadge({ since }: { since: string | null }) {
  const t = useT()
  const now = useNow()
  if (!since) return <>—</>
  const elapsed = Math.max(0, now - Date.parse(since))
  const level = waitLevel(elapsed)
  const look = WAIT_STYLE[level]
  const ago = waitAgo(elapsed)
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
      <span
        suppressHydrationWarning
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 11,
          lineHeight: "16px",
          fontWeight: level === "critical" ? 800 : 600,
          whiteSpace: "nowrap",
          background: look.chipBg,
          color: look.chipFg,
        }}
      >
        {level === "critical" && <CriticalIcon />}
        {t(`bo.wait.level.${level}`)}
      </span>
      <span suppressHydrationWarning style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
        {t(ago.key, { count: ago.count })}
      </span>
    </span>
  )
}

/**
 * "Os críticos podem ser filtrados." Um botão por cima da fila, com a contagem
 * viva. O filtro é uma marca no contentor (`data-wait-only`) e uma regra de
 * CSS sobre as linhas: como a cor de cada linha muda sozinha, o filtro
 * acompanha-a sem recarregar nada.
 */
export function WaitFilter({ scope, sinces }: { scope: string; sinces: (string | null)[] }) {
  const t = useT()
  const now = useNow()
  const [only, setOnly] = useState(false)
  const critical = sinces.filter((since) => levelAt(since, now) === "critical").length

  useEffect(() => {
    const host = document.getElementById(scope)
    if (!host) return
    if (only) host.setAttribute("data-wait-only", "critical")
    else host.removeAttribute("data-wait-only")
  }, [only, scope])

  return (
    <button
      type="button"
      aria-pressed={only}
      onClick={() => setOnly((value) => !value)}
      suppressHydrationWarning
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        border: `1px solid ${WAIT_STYLE.critical.edge}`,
        background: only ? WAIT_STYLE.critical.chipBg : "transparent",
        color: only ? WAIT_STYLE.critical.chipFg : WAIT_STYLE.critical.edge,
        opacity: critical === 0 && !only ? 0.55 : 1,
      }}
    >
      <CriticalIcon />
      {t("bo.wait.filter.critical", { count: critical })}
    </button>
  )
}

/**
 * "O master vê quantos [críticos] há em cada empresa." Uma etiqueta por
 * empresa com pelo menos um, a contar sozinha; cada uma filtra a fila por essa
 * empresa.
 */
export function WaitByCompany({
  rows,
  hrefFor,
}: {
  rows: { partnerId: string | null; partnerName: string | null; since: string | null }[]
  /** O endereço da fila filtrada por cada empresa (pelo id dela). */
  hrefFor?: Record<string, string>
}) {
  const t = useT()
  const now = useNow()
  const byCompany = new Map<string, { name: string; count: number }>()
  for (const row of rows) {
    if (levelAt(row.since, now) !== "critical") continue
    const id = row.partnerId ?? "—"
    const entry = byCompany.get(id) ?? { name: row.partnerName ?? "—", count: 0 }
    entry.count += 1
    byCompany.set(id, entry)
  }
  const list = Array.from(byCompany.entries()).sort((a, b) => b[1].count - a[1].count)

  return (
    <div
      suppressHydrationWarning
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}
      role="status"
    >
      <b style={{ color: WAIT_STYLE.critical.edge, display: "inline-flex", alignItems: "center", gap: 5 }}>
        <CriticalIcon />
        {t("bo.wait.byCompany.title")}
      </b>
      {list.length === 0 ? (
        <span style={{ opacity: 0.7 }}>{t("bo.wait.byCompany.none")}</span>
      ) : (
        list.map(([id, entry]) => {
          const label = `${entry.name} · ${entry.count}`
          const style = {
            padding: "2px 10px",
            borderRadius: 999,
            fontWeight: 700,
            textDecoration: "none",
            background: WAIT_STYLE.late.chipBg,
            color: WAIT_STYLE.late.chipFg,
          } as const
          const href = hrefFor?.[id]
          return href ? (
            <Link key={id} href={href} style={style}>
              {label}
            </Link>
          ) : (
            <span key={id} style={style}>
              {label}
            </span>
          )
        })
      )}
    </div>
  )
}
