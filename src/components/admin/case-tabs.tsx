"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useT } from "@/i18n/provider"

/**
 * Os separadores do caso, tal como na barra do mockup A4.
 *
 * Só existem os dois que estão construídos. O mockup mostra mais (Documentos,
 * Comunicações, Registo) e eles hão de vir — mas um separador que abre um ecrã
 * vazio ensina o vendedor a não carregar nos separadores.
 */
export function CaseTabs({
  caseId,
  offerCount,
}: {
  caseId: string
  offerCount: number
}) {
  const t = useT()
  const pathname = usePathname()
  const base = `/admin/casos/${caseId}`

  const tabs = [
    { href: base, label: t("admin.tabRequest"), count: null as number | null },
    { href: `${base}/ofertas`, label: t("admin.tabOffers"), count: offerCount },
  ]

  return (
    <div className="mt-4 flex gap-0.5 overflow-x-auto" role="tablist">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold transition-colors",
              active
                ? "border-adm-txt text-adm-txt"
                : "border-transparent text-adm-muted hover:text-adm-txt-2"
            )}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span className="rounded-full bg-adm-raise px-1.5 py-0.5 text-[10px] font-extrabold text-adm-txt-2">
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
