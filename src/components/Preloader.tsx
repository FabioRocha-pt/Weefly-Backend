"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, type Variants } from "framer-motion"

import { WEEFLY_LOGO_PATHS } from "@/components/weefly-logo"

const BRAND = "#EF5129"

/** The six sub-paths of the WeeFly logo (airplane + wordmark). */
const LOGO_PATHS: string[] = WEEFLY_LOGO_PATHS

/** Minimum time (ms) the preloader stays up so the draw sequence can play out. */
const MIN_DISPLAY_MS = 2400

const pathVariants: Variants = {
  hidden: { pathLength: 0, fillOpacity: 0 },
  visible: (i: number) => ({
    pathLength: 1,
    fillOpacity: 1,
    transition: {
      pathLength: { delay: i * 0.16, duration: 1.4, ease: [0.65, 0, 0.35, 1] },
      fillOpacity: { delay: i * 0.16 + 1.05, duration: 0.7, ease: "easeInOut" },
    },
  }),
}

export function Preloader() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Reveal the app once BOTH the window has finished loading and a minimum
    // display window has elapsed (so the animation never gets cut short).
    const minDelay = new Promise<void>((resolve) =>
      setTimeout(resolve, MIN_DISPLAY_MS)
    )
    const windowLoaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") return resolve()
      const onLoad = () => resolve()
      window.addEventListener("load", onLoad, { once: true })
    })

    let active = true
    Promise.all([minDelay, windowLoaded]).then(() => {
      if (active) setIsLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  // Lock scrolling while the overlay is visible.
  useEffect(() => {
    document.body.style.overflow = isLoading ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [isLoading])

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            y: -40,
            transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
          }}
          aria-hidden="true"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.svg
              width="122"
              height="94"
              viewBox="0 0 122 94"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-44 h-auto sm:w-52 drop-shadow-sm"
              initial="hidden"
              animate="visible"
            >
              {LOGO_PATHS.map((d, i) => (
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
          </motion.div>

          <span className="sr-only">A carregar WeeFly PRO…</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
