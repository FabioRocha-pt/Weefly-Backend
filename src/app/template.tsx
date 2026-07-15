"use client"

import { useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { usePathname } from "next/navigation"

/**
 * App Router page-transition wrapper.
 *
 * `template.tsx` is re-mounted by Next.js on every navigation, so the `initial`
 * → `animate` sequence replays for each route, giving a smooth fade-and-rise.
 *
 * Note: true *exit* animations aren't reliable with `template.tsx` because Next
 * unmounts the previous route's subtree before this one mounts — enter-only
 * transitions are the robust App Router pattern. AnimatePresence + the pathname
 * key keep the animation self-contained per route.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => {
          // Drop the resting transform so the wrapper can't become the
          // containing block for position:fixed descendants (e.g. the mobile
          // sidebar drawer, which relies on `fixed inset-0`).
          if (ref.current) ref.current.style.transform = "none"
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
