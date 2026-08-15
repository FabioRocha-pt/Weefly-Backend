"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Check, Globe, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  LOCALE_SHORT,
  type Locale,
} from "./config"
import { useI18n } from "./provider"

function persist(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`
}

/**
 * O seletor de idioma.
 *
 * Dois detalhes que não são óbvios:
 *
 *  - Quando a página é aberta com `?lang=fr`, o cookie é gravado no arranque.
 *    Sem isso, o cliente francês que recebeu o link e depois carrega num
 *    botão qualquer voltava a português na navegação seguinte, porque o
 *    parâmetro não sobrevive à mudança de página.
 *  - Trocar de idioma limpa o `?lang=` do endereço. Deixá-lo lá faria o
 *    parâmetro antigo ganhar ao cookie novo no render seguinte, e o seletor
 *    parecia estar avariado.
 */
export function LocaleSwitcher({
  variant = "light",
  className,
}: {
  variant?: "light" | "dark"
  className?: string
}) {
  const { locale } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    persist(locale)
  }, [locale])

  function choose(next: Locale) {
    setOpen(false)
    if (next === locale) return
    persist(next)

    const params = new URLSearchParams(searchParams.toString())
    params.delete("lang")
    const query = params.toString()

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname)
      router.refresh()
    })
  }

  const dark = variant === "dark"

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={LOCALE_LABELS[locale]}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
          dark
            ? "border-adm-line bg-adm-panel-2 text-adm-txt-2 hover:bg-adm-raise hover:text-adm-txt"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
        )}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Globe className="h-3.5 w-3.5" />
        )}
        {LOCALE_SHORT[locale]}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            role="listbox"
            className={cn(
              "absolute right-0 z-50 mt-1.5 min-w-[150px] overflow-hidden rounded-xl border shadow-lg",
              dark
                ? "border-adm-line bg-adm-panel"
                : "border-slate-200 bg-white"
            )}
          >
            {LOCALES.map((code) => (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={code === locale}
                  onClick={() => choose(code)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] transition-colors",
                    dark
                      ? "text-adm-txt-2 hover:bg-adm-panel-2 hover:text-adm-txt"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    code === locale && "font-semibold"
                  )}
                >
                  {LOCALE_LABELS[code]}
                  {code === locale && (
                    <Check
                      className={cn(
                        "ml-auto h-3.5 w-3.5",
                        dark ? "text-adm-ok" : "text-orange-600"
                      )}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
