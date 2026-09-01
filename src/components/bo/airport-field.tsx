"use client"

/**
 * BO-10 · o campo de aeroporto do back-office, com sugestões.
 *
 * O compositor pedia três letras escritas de cabeça. Quem cota copia do Amadeus
 * e engana-se — "MRK" em vez de "RAK", "LIS" em vez de "LIZ" — e o erro só
 * aparece no cartão do cliente, onde já não há nome de cidade nenhum a
 * denunciá-lo.
 *
 * O conjunto de dados **já existe**: é o mesmo que serve o formulário do
 * cliente, servido por `/api/airports` (nove mil aeroportos da OurAirports,
 * versionados em `src/data/airports.json`). O backlog é explícito a esse
 * respeito — reutilizar, não construir um segundo. Uma segunda lista é uma
 * lista que diverge.
 *
 * As regras que este campo cumpre:
 *
 *   · escrever estreita as opções, com um travão de 180 ms para não fazer uma
 *     pergunta por tecla;
 *   · casa com código IATA, nome de cidade e nome de país — é o que a rota faz,
 *     e é por isso que "cabo verde" devolve as ilhas todas;
 *   · mostra `RAK — Marraquexe`, o formato que o pedido escreve;
 *   · **só aceita uma entrada escolhida.** Sair do campo com texto que não
 *     corresponde a nada devolve-o ao último valor válido, em vez de guardar
 *     três letras que não são um aeroporto.
 */

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { inputClass } from "@/components/bo/composer-bits"

interface AirportHit {
  iata: string
  city: string
  name: string
  country: string
  countryName: string
}

/** "RAK — Marraquexe", como o backlog o escreve. */
export function airportLabel(hit: AirportHit): string {
  return `${hit.iata} — ${hit.city || hit.name}`
}

export function BoAirportField({
  value,
  onChange,
  disabled,
  placeholder = "RAI",
  id,
}: {
  /** O código IATA guardado. Nunca texto livre. */
  value: string
  onChange: (iata: string) => void
  disabled?: boolean
  placeholder?: string
  id?: string
}) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<AirportHit[]>([])
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  /** O nome da cidade do código já escolhido, para o campo o mostrar fechado. */
  const [chosen, setChosen] = useState<AirportHit | null>(null)
  const box = useRef<HTMLDivElement>(null)

  /* O rótulo do código que já lá está. Uma pergunta por código e não por tecla:
     é o mesmo pedido que `useAirportNames` faz, com um resultado só. */
  useEffect(() => {
    const code = value.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) {
      setChosen(null)
      return
    }
    if (chosen?.iata === code) return

    const controller = new AbortController()
    fetch(`/api/airports?iata=${code}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const hit = (json?.results as AirportHit[] | undefined)?.[0]
        setChosen(hit ?? null)
      })
      .catch(() => {
        /* sem catálogo o campo continua a valer pelo código */
      })
    return () => controller.abort()
  }, [value, chosen?.iata])

  /* A pesquisa. O travão existe porque escrever "marraquexe" são dez teclas, e
     dez pedidos para uma resposta é nove a mais. */
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setHits([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/airports?q=${encodeURIComponent(query.trim())}&limit=8`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          setHits((json?.results as AirportHit[] | undefined) ?? [])
          setCursor(0)
        })
        .catch(() => {
          /* uma pesquisa falhada não apaga o que já está no campo */
        })
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open])

  /* Clicar fora fecha a lista e desfaz o que estava escrito por acabar. */
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) close()
    }
    document.addEventListener("mousedown", away)
    return () => document.removeEventListener("mousedown", away)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close() {
    setOpen(false)
    setQuery("")
    setHits([])
  }

  function pick(hit: AirportHit) {
    onChange(hit.iata)
    setChosen(hit)
    close()
  }

  const display = open
    ? query
    : chosen
      ? airportLabel(chosen)
      : value

  return (
    <div className="relative" ref={box}>
      <input
        id={id}
        value={display}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id ?? "airport"}-options`}
        aria-autocomplete="list"
        onFocus={() => {
          setOpen(true)
          setQuery("")
        }}
        onChange={(event) => {
          setOpen(true)
          setQuery(event.target.value)
        }}
        onKeyDown={(event) => {
          if (!open) return
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setCursor((c) => Math.min(c + 1, hits.length - 1))
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (event.key === "Enter") {
            event.preventDefault()
            /* Enter sobre um código exacto escolhe-o mesmo sem lista: quem
               escreve "SID" de cor não devia ter de esperar por sugestões. */
            const exact = hits.find(
              (h) => h.iata === query.trim().toUpperCase()
            )
            const hit = exact ?? hits[cursor]
            if (hit) pick(hit)
          } else if (event.key === "Escape") {
            close()
          }
        }}
        onBlur={() => {
          /*
             "O campo só aceita uma entrada escolhida, nunca texto livre."

             Sair sem escolher devolve ao último valor válido. O `setTimeout`
             existe porque o `blur` chega antes do `click` numa sugestão — sem
             ele, clicar numa opção fechava a lista antes de a escolher.
          */
          setTimeout(() => {
            setOpen(false)
            setQuery("")
          }, 120)
        }}
        className={cn(inputClass, "font-mono")}
      />

      {open && hits.length > 0 && (
        <ul
          id={`${id ?? "airport"}-options`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-[240px] overflow-auto rounded-lg border border-adm-line bg-adm-panel py-1 shadow-xl"
        >
          {hits.map((hit, i) => (
            <li key={hit.iata}>
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(event) => {
                  /* `mousedown` e não `click`: o `blur` do campo dispara
                     primeiro, e um handler de `click` chegaria tarde. */
                  event.preventDefault()
                  pick(hit)
                }}
                className={cn(
                  "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-[12.5px]",
                  i === cursor ? "bg-adm-raise text-adm-txt" : "text-adm-txt-2"
                )}
              >
                <span className="font-mono font-semibold">{hit.iata}</span>
                <span className="min-w-0 flex-1 truncate">
                  {hit.city || hit.name}
                </span>
                <span className="shrink-0 text-[11px] text-adm-muted">
                  {hit.countryName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
