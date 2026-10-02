"use client"

/**
 * WeeFly · OCT-23 · o tutorial do ecrã actual, no topo, ao lado do sino.
 *
 * Um guia em passos, escolhido pelo endereço: a fila, a ficha do caso, o
 * Agente, o Admin, a escolha de módulo. Os textos estão no dicionário do
 * backoffice (`bo.tutorial.<ecrã>.steps`), na língua do utilizador e em
 * português por defeito. Um ecrã sem guia próprio mostra o geral.
 *
 * `variant`: `bo` usa as classes do Price Checker (escuro), `pro` as do WeeFly
 * Pro (claro).
 */

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { HelpCircle, X } from "lucide-react"

import { useT } from "@/i18n/provider"

const SCREENS: { id: string; match: (path: string) => boolean; steps: number }[] = [
  { id: "case", match: (p) => /^\/admin\/price-checker\/[^/]+/.test(p), steps: 4 },
  { id: "queue", match: (p) => p.startsWith("/admin/price-checker"), steps: 4 },
  { id: "admin", match: (p) => p.startsWith("/gestao"), steps: 3 },
  { id: "agent", match: (p) => p.startsWith("/agente"), steps: 3 },
  { id: "modules", match: (p) => p.startsWith("/modulo"), steps: 2 },
]

export function TutorialButton({ variant = "pro" }: { variant?: "bo" | "pro" }) {
  const t = useT()
  const pathname = usePathname() ?? ""
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  const screen = SCREENS.find((s) => s.match(pathname)) ?? { id: "general", steps: 2 }
  const total = screen.steps
  const base = `bo.tutorial.${screen.id}`

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const trigger =
    variant === "bo"
      ? "bell"
      : "p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"

  return (
    <>
      <button
        type="button"
        className={trigger}
        title={t("bo.tutorial.open")}
        aria-label={t("bo.tutorial.open")}
        onClick={() => {
          setStep(0)
          setOpen(true)
        }}
      >
        <HelpCircle className={variant === "bo" ? "h-4 w-4" : "h-5 w-5"} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-800 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                  {t(`${base}.title`)} · {t("bo.tutorial.stepOf", { n: step + 1, total })}
                </p>
                <h2 id="tutorial-title" className="mt-1 text-lg font-bold text-slate-900">
                  {t(`${base}.steps.${step}.title`)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label={t("bo.tutorial.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(`${base}.steps.${step}.body`)}</p>
            <div className="mt-5 flex items-center justify-between">
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={`h-1.5 w-5 rounded-full ${i === step ? "bg-orange-600" : "bg-slate-200"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                  >
                    {t("bo.tutorial.back")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (step + 1 < total ? setStep((s) => s + 1) : setOpen(false))}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
                >
                  {step + 1 < total ? t("bo.tutorial.next") : t("bo.tutorial.done")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
