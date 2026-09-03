"use client"

/**
 * PC-12 · a marca da companhia, com o código como rede.
 *
 * O requisito é "mostrar o logótipo da companhia quando ela está escolhida" e a
 * nota que o acompanha desde o Sprint 1 é a que manda no desenho: **a falta de
 * logótipo cai no código**. É por isso que este componente não é um `<img>`.
 *
 * C-10 · os logótipos passaram a existir: 31 PNG em `public/airlines`,
 * nomeados pelo código IATA em minúsculas. Este componente procurava
 * `/carriers/{CÓDIGO}.svg`, um caminho onde nunca houve nada — e por isso a
 * pastilha com o código era o que sempre se via.
 *
 * A queda para o código continua, e agora em duas camadas. A primeira decide
 * **antes** de renderizar, a partir da lista que acompanha o pacote: uma
 * companhia sem ficheiro nunca chega a pedir uma imagem, e por isso não pisca
 * (desenhar o espaço, tentar, falhar, trocar — numa lista de dez ofertas são
 * dez piscas). O `onError` fica como segunda rede, para o ficheiro que
 * desapareça do disco.
 *
 * Sem `next/image`: são ficheiros estáticos de 24 píxeis de altura, e o
 * optimizador não tem nada para optimizar num SVG servido da mesma origem.
 */

import { useState } from "react"

import { cn } from "@/lib/utils"
import { CARRIERS } from "@/lib/pc/catalog"
import { airlineLogoPath, airlineName, hasAirlineLogo } from "@/lib/airlines-catalog"

export function CarrierMark({
  code,
  className,
}: {
  code: string | null | undefined
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const upper = (code ?? "").trim().toUpperCase()

  if (!upper) return null

  const carrier = CARRIERS[upper]
  /* Sem ficheiro conhecido, nem se tenta. Ver o comentário no topo. */
  const showCode = broken || !hasAirlineLogo(upper)

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showCode ? (
        <span
          aria-hidden="true"
          className="grid h-6 min-w-[30px] place-items-center rounded-[5px] border border-adm-line bg-adm-panel-2 px-1.5 font-mono text-[11px] font-bold text-adm-txt-2"
        >
          {upper}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={airlineLogoPath(upper)}
          alt={airlineName(upper)}
          height={24}
          className="h-6 w-auto max-w-[74px] object-contain"
          onError={() => setBroken(true)}
        />
      )}
      <span className="text-[12.5px] text-adm-txt-2">
        {/* C-10 · o nome das 31, e não só das dez de `CARRIERS`. */}
        {airlineName(upper)}
        {carrier?.prefix && (
          <span className="ml-1.5 font-mono text-[11px] text-adm-muted">
            {carrier.prefix}
          </span>
        )}
      </span>
    </span>
  )
}
