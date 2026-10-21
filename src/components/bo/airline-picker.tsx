"use client"

/**
 * O seletor de companhias com autocomplete (pedido do Ivandro, 21 Out).
 *
 * Substitui os três `<select>` de trinta e tal linhas — proposta, bilhete e
 * emissão. Escreve-se o código ou parte do nome ("tap", "maroc", "VR") e a
 * lista filtra; setas e Enter escolhem. A lista é a do Admin
 * (`/gestao/companhias`), com o logótipo de cada uma.
 *
 * Um código de duas letras que não está na lista pode ser usado na mesma, como
 * os `<select>` antigos permitiam com «fora do catálogo»: uma companhia que
 * falta no Admin não pode impedir uma proposta nem uma emissão.
 */

import { useId, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { airlineLogo, airlineName } from "@/lib/airlines-catalog"
import { useAirlineList } from "@/components/airlines-provider"
import { useT } from "@/i18n/provider"

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function Mark({ code }: { code: string }) {
  const logo = airlineLogo(code)
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="h-4 w-10 shrink-0 object-contain" />
  ) : (
    <span className="grid h-4 w-10 shrink-0 place-items-center rounded-[4px] border border-adm-line font-mono text-[10px] font-bold text-adm-txt-2">
      {code}
    </span>
  )
}

export function AirlinePicker({
  value,
  onChange,
  disabled,
  id,
  className,
}: {
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  id?: string
  className?: string
}) {
  const t = useT()
  const airlines = useAirlineList()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const current = value.trim().toUpperCase()

  const options = useMemo(() => {
    const q = fold(query.trim())
    const found = q
      ? airlines
          .filter((a) => a.iata.toLowerCase().startsWith(q) || fold(a.name).includes(q))
          .sort((a, b) => Number(b.iata.toLowerCase() === q) - Number(a.iata.toLowerCase() === q))
      : airlines
    const code = query.trim().toUpperCase()
    const custom = /^[A-Z0-9]{2}$/.test(code) && !airlines.some((a) => a.iata === code) ? code : null
    return { found, custom }
  }, [airlines, query])

  const total = options.found.length + (options.custom ? 1 : 0)

  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
    setQuery("")
    inputRef.current?.blur()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, Math.max(total - 1, 0)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === "Enter") {
      /* Nunca submete o formulário à volta: o Enter aqui é escolher. */
      event.preventDefault()
      if (!open || total === 0) return
      const chosen = options.found[active]?.iata ?? options.custom
      if (chosen) pick(chosen)
    } else if (event.key === "Escape") {
      setOpen(false)
      setQuery("")
    }
  }

  const shown = open ? query : current ? `${current} · ${airlineName(current)}` : ""

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className={cn(className, "pr-7")}
          placeholder={open && current ? `${current} · ${airlineName(current)}` : t("bo.airlines.picker.placeholder")}
          value={shown}
          disabled={disabled}
          onFocus={() => {
            setOpen(true)
            setQuery("")
            setActive(0)
          }}
          onBlur={() => {
            setOpen(false)
            setQuery("")
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        {current && !disabled && (
          <button
            type="button"
            aria-label={t("bo.airlines.picker.clear")}
            title={t("bo.airlines.picker.clear")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none text-adm-muted hover:text-adm-txt"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange("")}
          >
            ×
          </button>
        )}
      </div>

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 min-w-[240px] overflow-auto rounded-md border border-adm-line bg-adm-panel py-1 text-[13px] text-adm-txt shadow-xl"
        >
          {options.found.map((a, i) => (
            <li
              key={a.iata}
              role="option"
              aria-selected={a.iata === current}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-2.5 py-1.5",
                i === active && "bg-adm-raise",
                a.iata === current && "font-semibold"
              )}
              onMouseEnter={() => setActive(i)}
              /* `mouseDown` e não `click`: o `blur` do campo fecha a lista antes do click. */
              onMouseDown={(event) => {
                event.preventDefault()
                pick(a.iata)
              }}
            >
              <Mark code={a.iata} />
              <span className="font-mono text-[12px] text-adm-txt-2">{a.iata}</span>
              <span className="truncate">{a.name}</span>
            </li>
          ))}
          {options.custom && (
            <li
              role="option"
              aria-selected={false}
              className={cn(
                "cursor-pointer px-2.5 py-1.5 text-adm-txt-2",
                active === options.found.length && "bg-adm-raise"
              )}
              onMouseEnter={() => setActive(options.found.length)}
              onMouseDown={(event) => {
                event.preventDefault()
                pick(options.custom!)
              }}
            >
              {t("bo.airlines.picker.useCode", { code: options.custom })}
            </li>
          )}
          {total === 0 && <li className="px-2.5 py-1.5 text-adm-muted">{t("bo.airlines.picker.none")}</li>}
        </ul>
      )}
    </div>
  )
}
