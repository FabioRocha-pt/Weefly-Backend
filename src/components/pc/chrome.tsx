"use client"

/**
 * WeeFly Price Checker — a moldura: topbar, rodapé, botão flutuante e o toast.
 *
 * Cliente porque tudo aqui reage a um clique: abrir o WhatsApp com a referência
 * escrita, copiar, trocar a língua em que a equipa responde.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react"

import { WeeFlyLogo } from "@/components/weefly-logo"
import { CUR, WA_DISPLAY, WA_NUMBER } from "@/lib/pc/catalog"
import { waLink } from "@/lib/pc/format"
import { IcWa } from "@/components/pc/bits"

// ── toast ────────────────────────────────────────────────────────────────────

const ToastContext = createContext<(message: string) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)

  const show = useCallback((text: string) => setMessage(text), [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 2200)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast${message ? " on" : ""}`}>{message}</div>
    </ToastContext.Provider>
  )
}

// ── topbar ───────────────────────────────────────────────────────────────────

export type PcLang = "EN" | "PT" | "FR"

const LANG_TOAST: Record<PcLang, string> = {
  EN: "Replies in English",
  PT: "A equipa responde em português",
  FR: "L'équipe répond en français",
}

/**
 * A barra de topo.
 *
 * Os dois botões da direita não são decoração: dizem em que língua a equipa
 * responde e em que moeda o preço é cotado. Depois de o pedido existir, a moeda
 * deixa de ser editável — mudá-la depois de a cotação estar feita mudaria o
 * preço que o cliente já viu — e a língua continua a ser, porque essa é sobre
 * ele e não sobre o preço.
 */
export function PcTopbar({
  reference,
  currency,
  lang,
  onLangChange,
  onCurrencyChange,
}: {
  reference?: string | null
  currency: string
  lang: PcLang
  onLangChange?: (next: PcLang) => void
  onCurrencyChange?: (next: string) => void
}) {
  const toast = useToast()
  const cycle = <T,>(list: T[], current: T): T =>
    list[(list.indexOf(current) + 1) % list.length]

  return (
    <header className="topbar">
      <div className="topbar-in">
        <div>
          <WeeFlyLogo className="logo" />
          <div className="brandline">Price Checker</div>
        </div>
        <div className="prefs">
          {reference && (
            <span className="refchip">
              <span className="k">Request</span>
              <span className="v mono">{reference}</span>
            </span>
          )}
          <button
            className="pref"
            type="button"
            onClick={() => {
              const next = cycle<PcLang>(["EN", "PT", "FR"], lang)
              onLangChange?.(next)
              toast(LANG_TOAST[next])
            }}
          >
            {lang}
          </button>
          <button
            className="pref"
            type="button"
            title={
              onCurrencyChange
                ? undefined
                : "The currency is fixed by the quote for this request"
            }
            onClick={() => {
              if (!onCurrencyChange) {
                toast("The price is quoted in " + currency + " for this request")
                return
              }
              const next = cycle(Object.keys(CUR), currency)
              onCurrencyChange(next)
              toast("Prices now shown in " + next)
            }}
          >
            {CUR[currency]?.label ?? currency}
          </button>
        </div>
      </div>
    </header>
  )
}

/** A barra de três passos, só na fase do pedido. */
export function PcStepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["1 · Trip", "2 · Contact", "3 · Request sent"]
  return (
    <div className="shell">
      <nav className="steps" aria-label="Progress">
        {labels.map((label, i) => {
          const n = i + 1
          const state = n < step ? " done" : n === step ? " now" : ""
          return (
            <div className={`stp${state}`} key={label}>
              <span className="sbar" />
              <span className="lb">{label}</span>
            </div>
          )
        })}
      </nav>
    </div>
  )
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * O botão de WhatsApp, em qualquer um dos sítios onde aparece.
 *
 * A referência vai escrita na mensagem porque é a primeira coisa que a equipa
 * pergunta — e o cliente não a sabe de cor.
 */
export function WaButton({
  reference,
  children,
  className = "btn btn-wa",
  style,
}: {
  reference?: string | null
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() =>
        window.open(waLink(WA_NUMBER, reference), "_blank", "noopener")
      }
    >
      {children}
    </button>
  )
}

export function PcFab() {
  return (
    <button
      type="button"
      className="fab"
      onClick={() => window.open(waLink(WA_NUMBER), "_blank", "noopener")}
    >
      <IcWa size={21} />
      <span>Chat with us</span>
    </button>
  )
}

export function PcFooter() {
  return (
    <footer>
      <div className="foot-in">
        WeeFly Africa · Praia, Cape Verde · <b>weefly.africa</b> ·{" "}
        <span className="mono">{WA_DISPLAY}</span>
      </div>
    </footer>
  )
}

// ── copiar ───────────────────────────────────────────────────────────────────

/** Copia e diz que copiou, no próprio botão. */
export function CopyButton({
  value,
  className = "cp",
  label,
  doneLabel = "Copied",
}: {
  value: string
  className?: string
  label: string
  doneLabel?: string
}) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 1400)
    return () => clearTimeout(timer)
  }, [done])

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        navigator.clipboard?.writeText(value).catch(() => {})
        setDone(true)
      }}
    >
      {done ? doneLabel : label}
    </button>
  )
}
