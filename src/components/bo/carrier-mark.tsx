"use client"

/**
 * PC-12 · a marca da companhia, com o código como rede.
 *
 * O requisito é "mostrar o logótipo da companhia quando ela está escolhida" e a
 * nota que o acompanha desde o Sprint 1 é a que manda no desenho: **a falta de
 * logótipo cai no código**. É por isso que este componente não é um `<img>`.
 *
 * Como funciona: procura `/carriers/{CÓDIGO}.svg` na pasta pública. Se o
 * ficheiro existir, aparece; se não existir — e hoje não existe nenhum — o
 * `onError` troca-o pela pastilha com o código IATA, que é legível, cabe no
 * mesmo espaço e nunca falha. Acrescentar `public/carriers/TP.svg` faz o
 * logótipo da TAP aparecer em todo o lado sem se tocar em código.
 *
 * Sem `next/image`: são ficheiros estáticos de 24 píxeis de altura, e o
 * optimizador não tem nada para optimizar num SVG servido da mesma origem.
 */

import { useState } from "react"

import { cn } from "@/lib/utils"
import { CARRIERS } from "@/lib/pc/catalog"

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

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {broken ? (
        <span
          aria-hidden="true"
          className="grid h-6 min-w-[30px] place-items-center rounded-[5px] border border-adm-line bg-adm-panel-2 px-1.5 font-mono text-[11px] font-bold text-adm-txt-2"
        >
          {upper}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/carriers/${upper}.svg`}
          alt={carrier?.name ?? upper}
          height={24}
          className="h-6 w-auto max-w-[74px] object-contain"
          onError={() => setBroken(true)}
        />
      )}
      <span className="text-[12.5px] text-adm-txt-2">
        {carrier?.name ?? upper}
        {carrier?.prefix && (
          <span className="ml-1.5 font-mono text-[11px] text-adm-muted">
            {carrier.prefix}
          </span>
        )}
      </span>
    </span>
  )
}
