"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useT } from "@/i18n/provider"

/**
 * MIN-01 · a barra inferior, fixa e sempre visível: Novo pedido e Minhas
 * passagens. A mesma nos ecrãs do caso (`/pc/…`) de um ministério, para que a
 * secretária nunca fique sem caminho de volta.
 */
export function MinistryTabBar({ base }: { base: string }) {
  const t = useT()
  const pathname = usePathname()
  const onTrips = pathname.startsWith(`${base}/passagens`)
  const onNew = pathname === base

  const tab = (href: string, active: boolean, icon: string, label: string) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "8px 0 10px",
        fontSize: 12,
        fontWeight: active ? 800 : 600,
        color: active ? "var(--ember)" : "var(--muted)",
        textDecoration: "none",
      }}
    >
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
        {icon}
      </span>
      {label}
    </Link>
  )

  return (
    <>
      {/* O espaço que a barra ocupa, para o conteúdo não ficar por baixo dela. */}
      <div style={{ height: 76 }} aria-hidden />
      <nav
        aria-label={t("ministry.tabs.label")}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          display: "flex",
          background: "#fff",
          borderTop: "1px solid var(--line)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {tab(base, onNew, "＋", t("ministry.tabs.new"))}
        {tab(`${base}/passagens`, onTrips, "✈", t("ministry.tabs.trips"))}
      </nav>
    </>
  )
}
