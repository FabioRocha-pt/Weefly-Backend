"use client"

/**
 * WeeFly Price Checker — a moldura: topbar, rodapé, botão flutuante e o toast.
 *
 * Cliente porque tudo aqui reage a um clique: abrir o WhatsApp com a referência
 * escrita, copiar, trocar a língua em que a equipa responde.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"

import { setPcLocale } from "@/actions/pc"
import { WeeFlyLogo } from "@/components/weefly-logo"
import { CUR, WA_DISPLAY, WA_NUMBER } from "@/lib/pc/catalog"
import { waLink } from "@/lib/pc/format"
import { IcWa } from "@/components/pc/bits"
import { LOCALES, LOCALE_SHORT, type Locale } from "@/i18n/config"
import { useT } from "@/i18n/provider"

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

/**
 * A barra de topo.
 *
 * Os dois botões da direita não são decoração: dizem em que língua a equipa
 * responde e em que moeda o preço é cotado. Depois de o pedido existir, a moeda
 * deixa de ser editável — mudá-la depois de a cotação estar feita mudaria o
 * preço que o cliente já viu — e a língua continua a ser, porque essa é sobre
 * ele e não sobre o preço.
 *
 * T-08 · o seletor de língua faz alguma coisa.
 *
 * "O cliente escolheu português, a notificação chegou, e o link abriu
 * inteiramente em inglês. O seletor de língua nesses ecrãs não faz nada." Fazia
 * mesmo nada: `onLangChange` era opcional, ninguém o passava, e o clique
 * limitava-se a mostrar um aviso com o nome da língua que não tinha mudado.
 *
 * Agora o botão chama `setPcLocale`, que grava a escolha no cookie deste pedido
 * e na coluna do lead — a segunda porque o critério pede que a mesma língua
 * mande nos emails e no WhatsApp, e esses saem horas depois sem browser nenhum
 * do outro lado.
 *
 * Sem `token` o botão continua a existir e não grava nada: é o caso do
 * formulário público, onde ainda não há pedido a que a preferência pertença.
 */
export function PcTopbar({
  reference,
  currency,
  lang,
  token,
  onLangChange,
  onCurrencyChange,
}: {
  reference?: string | null
  currency: string
  lang: Locale
  /** O pedido a que esta preferência pertence. Ausente no formulário público. */
  token?: string
  onLangChange?: (next: Locale) => void
  onCurrencyChange?: (next: string) => void
}) {
  const t = useT()
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const cycle = <T,>(list: readonly T[], current: T): T =>
    list[(list.indexOf(current) + 1) % list.length]

  function switchLanguage() {
    const next = cycle(LOCALES, lang)

    if (onLangChange) {
      /*
       * O formulário público. O estado local existe porque é ele que vai no
       * pedido quando o cliente submete (a coluna `locale` do lead), mas mudá-lo
       * sozinho não retraduzia nada: o dicionário é resolvido no servidor, e o
       * servidor lê o `?lang=`. Por isso as duas coisas — o estado que viaja com
       * o pedido, e o endereço que faz a página voltar traduzida.
       */
      onLangChange(next)
      const params = new URLSearchParams(window.location.search)
      params.set("lang", next)
      router.replace(`${window.location.pathname}?${params.toString()}`)
      router.refresh()
      return
    }
    if (!token) return

    startTransition(async () => {
      const result = await setPcLocale(token, next)
      if (!result.ok) {
        toast(result.error)
        return
      }
      /* O aviso na língua nova, que é a confirmação mais directa de que a
         mudança pegou. `refresh()` volta a correr a página do servidor com o
         cookie já escrito, e os ecrãs saem traduzidos. */
      toast(t(`pc.langToast.${next}`))
      router.refresh()
    })
  }

  return (
    <header className="topbar">
      <div className="topbar-in">
        <div>
          <WeeFlyLogo className="logo" />
          <div className="brandline">Price Checker</div>
        </div>
        <div className="prefs">
          {/*
            T-14 · a referência na faixa, em cima e à direita, em monospace e
            seleccionável. "A mesma posição e o mesmo tratamento em todo o lado"
            — é a mesma peça que os emails desenham em `emails/shared.ts`.
          */}
          {reference && (
            <span className="refchip">
              <span className="k">{t("pc.topbar.reference")}</span>
              <span className="v mono">{reference}</span>
            </span>
          )}
          <button
            className="pref"
            type="button"
            disabled={pending}
            title={t("pc.topbar.languageHint")}
            onClick={switchLanguage}
          >
            {LOCALE_SHORT[lang]}
          </button>
          <button
            className="pref"
            type="button"
            title={
              onCurrencyChange ? undefined : t("pc.topbar.currencyFixed", { currency })
            }
            onClick={() => {
              if (!onCurrencyChange) {
                toast(t("pc.topbar.currencyFixed", { currency }))
                return
              }
              const next = cycle(Object.keys(CUR), currency)
              onCurrencyChange(next)
              toast(t("pc.topbar.currencyNow", { currency: next }))
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
  /*
   * FE-05 · o terceiro passo passa a ser a revisão, não o "pedido enviado".
   *
   * O rótulo antigo prometia um passo que não existia: o pedido saía no fim do
   * segundo, e o terceiro era o ecrã de confirmação já do outro lado. Agora há
   * mesmo um terceiro — o resumo que se lê antes de enviar — e o pedido só é
   * criado depois de alguém carregar em "confirmar".
   */
  const t = useT()
  const labels = [
    `1 · ${t("pc.stepper.trip")}`,
    `2 · ${t("pc.stepper.contact")}`,
    `3 · ${t("pc.stepper.review")}`,
  ]
  return (
    <div className="shell">
      <nav className="steps" aria-label={t("pc.stepper.label")}>
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
  const t = useT()
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() =>
        window.open(waLink(WA_NUMBER, reference, t), "_blank", "noopener")
      }
    >
      {children}
    </button>
  )
}

export function PcFab() {
  const t = useT()
  return (
    <button
      type="button"
      className="fab"
      onClick={() => window.open(waLink(WA_NUMBER, null, t), "_blank", "noopener")}
    >
      <IcWa size={21} />
      <span>{t("pc.chat")}</span>
    </button>
  )
}

/**
 * T-19 · o número de telefone é um link que abre o WhatsApp.
 *
 * "O ecrã do passaporte tem o logótipo e o telefone clicável." O logótipo está
 * na barra de topo, que o router desenha em todos os ecrãs; o número estava
 * aqui, em monospace e morto. Num telemóvel, um número que não se pode tocar é
 * um número que se copia à mão — e o rodapé é o sítio onde alguém encravado no
 * formulário dos passaportes vai procurar ajuda.
 *
 * WhatsApp e não `tel:` porque é onde a equipa atende: o `WA_NUMBER` é a linha
 * do concierge, e um telefonema para lá toca numa aplicação que ninguém ouve.
 */
export function PcFooter() {
  const t = useT()
  return (
    <footer>
      <div className="foot-in">
        {t("pc.footer.place")} · <b>weefly.africa</b> ·{" "}
        <a
          className="mono"
          href={waLink(WA_NUMBER, null, t)}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          {WA_DISPLAY}
        </a>
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
  doneLabel,
}: {
  value: string
  className?: string
  label: string
  doneLabel?: string
}) {
  const t = useT()
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
      {done ? (doneLabel ?? t("pc.copied")) : label}
    </button>
  )
}
