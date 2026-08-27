"use client"

/**
 * PC-B · as peças de formulário que a proposta e o bilhete partilham.
 *
 * Viviam no fundo de `components/admin/offer-composer.tsx`, o ficheiro de 2058
 * linhas que o PC-B manda partir em dois. Partir o compositor sem partir isto
 * primeiro daria dois ficheiros com o mesmo `Input` escrito duas vezes — e a
 * primeira vez que alguém mudasse a altura de um campo, mudava-a em metade dos
 * sítios.
 *
 * Nada aqui sabe o que é uma oferta. São campos.
 */

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { formatAmountPlain, parseMoney } from "@/lib/proposal-math"

export const inputClass =
  "w-full rounded-lg border border-adm-line bg-adm-panel px-2.5 py-2 text-[13px] text-adm-txt outline-none transition-colors placeholder:text-[#5D6B82] focus:border-[#46587A] disabled:opacity-50"

const SPANS: Record<number, string> = {
  2: "col-span-6 sm:col-span-2",
  3: "col-span-6 sm:col-span-3",
  4: "col-span-12 sm:col-span-4",
  6: "col-span-12 sm:col-span-6",
  12: "col-span-12",
}

export function Field({
  label,
  span,
  hint,
  prefilled,
  children,
}: {
  label: string
  span: number
  hint?: string
  /**
   * FB-01 · veio do pedido do cliente e não foi escrito por quem cota.
   *
   * O pedido diz que os valores pré-preenchidos têm de se distinguir dos que o
   * agente escreveu. Sem isso, quem abre uma proposta a meio não sabe o que já
   * foi verificado por uma pessoa e o que ainda é um palpite.
   */
  prefilled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", SPANS[span])}>
      <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.07em] text-adm-muted">
        {label}
        {prefilled && (
          <span className="rounded-[4px] bg-adm-muted/[.18] px-1 py-px text-[8.5px] font-extrabold tracking-[.06em] text-adm-txt-2">
            do pedido
          </span>
        )}
      </label>
      {children}
      {hint && <span className="text-[10.5px] text-adm-muted">{hint}</span>}
    </div>
  )
}

export function Input({
  value,
  onChange,
  mono,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  mono?: boolean
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClass, mono && "font-mono")}
    />
  )
}

/** Normaliza no blur: quem escreve "545" fica com "545,00" e vê o que gravou. */
export function MoneyInput({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onChange(formatAmountPlain(parseMoney(value)))}
      className={cn(inputClass, "text-right font-mono")}
    />
  )
}

/**
 * FB-03 · o contador `−` `0` `+` da bagagem.
 *
 * Três estados e não dois: `null` é "por responder", e é o que uma oferta nova
 * mostra. Zero é "esta tarifa não inclui mala", que é uma resposta. Sem a
 * distinção, cada oferta nascia a prometer zero malas sem ninguém o ter dito, e
 * o vendedor não tinha como saber quais é que ainda faltavam.
 *
 * O `−` no zero devolve ao estado por responder em vez de ficar preso: é a única
 * forma de desfazer um clique dado por engano.
 */
export function CountField({
  value,
  onChange,
  disabled,
  requested,
}: {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  /** O que o cliente pediu, quando faz sentido compará-lo (VIP-10). */
  requested?: number
}) {
  const step = (delta: number) => {
    if (value === null) return onChange(delta > 0 ? 1 : 0)
    const next = value + delta
    if (next < 0) return onChange(null)
    onChange(Math.min(next, 9))
  }

  const short = requested !== undefined && value !== null && value < requested

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          inputClass,
          "flex items-center justify-between gap-2 px-1.5",
          disabled && "opacity-60"
        )}
      >
        <CountStep label="−" onClick={() => step(-1)} disabled={disabled} />
        <span
          className={cn(
            "min-w-[2ch] text-center font-mono text-[13px] font-semibold",
            value === null ? "text-adm-muted" : "text-adm-txt"
          )}
        >
          {value === null ? "—" : value}
        </span>
        <CountStep label="+" onClick={() => step(1)} disabled={disabled} />
      </div>
      {requested !== undefined && requested > 0 && (
        <span
          className={cn(
            "text-[10.5px]",
            short ? "text-adm-warn" : "text-adm-muted"
          )}
        >
          {short ? `O cliente pediu ${requested}` : `Pedido: ${requested}`}
        </span>
      )}
    </div>
  )
}

function CountStep({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "Mais um" : "Menos um"}
      className="h-6 w-6 shrink-0 rounded-md border border-adm-line bg-adm-panel-2 text-[13px] font-bold leading-none text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt disabled:opacity-40"
    >
      {label}
    </button>
  )
}

export function PriceRow({
  label,
  hint,
  qty,
  value,
  onChange,
  tone,
}: {
  label: string
  hint: string
  qty: string
  value: string
  onChange: (value: string) => void
  tone?: "fee"
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_96px_128px] items-center gap-2.5 border-b border-adm-line-soft px-3 py-2.5",
        tone === "fee" && "bg-adm-ember/[.06]"
      )}
    >
      <div>
        <span className="text-[13px] font-semibold text-adm-txt">{label}</span>
        <small className="block text-[11px] font-medium text-adm-muted">
          {hint}
        </small>
      </div>
      <div className="text-center font-mono text-xs text-adm-muted">{qty}</div>
      <MoneyInput value={value} onChange={onChange} />
    </div>
  )
}

export function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="text-[11px] font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {title}
        </h3>
        <span className="h-px flex-1 bg-adm-line-soft" />
        {aside && <span className="text-[11px] text-adm-muted">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

export function Flag({
  label,
  on,
  tone,
  disabled,
  onClick,
}: {
  label: string
  on: boolean
  tone?: "ok"
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-[7px] border px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50",
        !on && "border-adm-line bg-adm-panel-2 text-adm-muted hover:text-adm-txt-2",
        on && tone === "ok" && "border-adm-ok/40 bg-adm-ok/[.14] text-adm-ok",
        on && tone !== "ok" && "border-adm-txt bg-adm-txt text-adm-panel"
      )}
    >
      {label}
    </button>
  )
}

export function IconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[9px] border border-adm-line bg-adm-panel-2 p-1.5 text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  )
}

export function Check2({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2.5 text-[13px] text-adm-txt-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[15px] w-[15px] accent-adm-ember"
      />
      {label}
    </label>
  )
}

/**
 * FE-01 · os códigos IATA desta oferta, virados em nomes de cidade.
 *
 * O mesmo endpoint que o formulário do cliente usa — `/api/airports` — e é
 * essa a razão de ser deste pedaço: o catálogo é um só, servido de um só sítio,
 * e o back-office lê-o pela mesma porta que o cliente e que o futuro bot do
 * WhatsApp. O vendedor escreve "SID" copiado do Amadeus e vê "Sal" debaixo do
 * campo; se escrever um código que não existe, vê que não existe antes de o
 * cliente ver.
 */
export function useAirportNames(codes: string[]): Record<string, string | null> {
  const [names, setNames] = useState<Record<string, string | null>>({})
  const wanted = codes
    .filter((c) => /^[A-Za-z]{3}$/.test(c))
    .map((c) => c.toUpperCase())
  const key = Array.from(new Set(wanted)).sort().join(",")

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()

    fetch(`/api/airports?iata=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json?.results) return
        const found: Record<string, string | null> = {}
        for (const code of key.split(",")) found[code] = null
        for (const place of json.results as {
          iata: string
          city: string
          name: string
        }[]) {
          found[place.iata] = place.city || place.name
        }
        setNames((current) => ({ ...current, ...found }))
      })
      .catch(() => {
        /* sem catálogo o campo continua a valer pelo código */
      })

    return () => controller.abort()
  }, [key])

  return names
}
