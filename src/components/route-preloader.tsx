"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, type Variants } from "framer-motion"
import { usePathname } from "next/navigation"

import { WEEFLY_LOGO_PATHS } from "@/components/weefly-logo"

/**
 * O logótipo da WeeFly a desenhar-se, no início de cada página.
 *
 * O `Preloader` do layout de raiz corre uma vez por carregamento do site — é o
 * arranque da aplicação. Este corre a cada mudança de endereço dentro da secção
 * onde é montado, porque o Price Checker é uma sequência de ecrãs e o cliente
 * atravessa-os todos sem nunca recarregar a página: sem isto, veria a animação
 * uma vez e nunca mais.
 *
 * Bem mais curto do que o do arranque (900 ms contra 2400): ali a animação é a
 * apresentação da marca, aqui é a costura entre dois ecrãs. Uma pausa longa
 * entre "escolher opção" e "pagar" não é uma marca, é um atraso.
 */
const BRAND = "#EF5129"
const HOLD_MS = 900

const pathVariants: Variants = {
  hidden: { pathLength: 0, fillOpacity: 0 },
  visible: (i: number) => ({
    pathLength: 1,
    fillOpacity: 1,
    transition: {
      pathLength: { delay: i * 0.05, duration: 0.55, ease: [0.65, 0, 0.35, 1] },
      fillOpacity: { delay: i * 0.05 + 0.34, duration: 0.3, ease: "easeInOut" },
    },
  }),
}

export function RoutePreloader({
  /** Fundo do overlay. O back-office é escuro; o Price Checker é claro. */
  background = "#F1F5F9",
  label = "A carregar",
}: {
  background?: string
  label?: string
}) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), HOLD_MS)
    return () => clearTimeout(timer)
  }, [pathname])

  /*
   * Sem bloquear o scroll: o overlay dura menos de um segundo e mexer no
   * `overflow` do body a cada navegação faz a página saltar quando a barra de
   * scroll aparece e desaparece.
   */
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={pathname}
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            display: "grid",
            placeItems: "center",
            background,
          }}
        >
          <motion.svg
            width="122"
            height="94"
            viewBox="0 0 122 94"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: "min(38vw, 170px)", height: "auto" }}
            initial="hidden"
            animate="visible"
          >
            {WEEFLY_LOGO_PATHS.map((d, i) => (
              <motion.path
                key={i}
                d={d}
                fill={BRAND}
                stroke={BRAND}
                strokeWidth={0.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                variants={pathVariants}
                custom={i}
              />
            ))}
          </motion.svg>
          <span
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
          >
            {label}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
