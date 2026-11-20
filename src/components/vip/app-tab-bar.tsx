"use client"

/**
 * APP-01 · a barra inferior da app do cliente VIP.
 *
 * "Três separadores, com ícone e nome, fixos em baixo": Fazer pedido, Minhas
 * passagens e Meus dados. Sempre visível, por cima da área segura do
 * telemóvel; o separador ativo distingue-se pela cor e pelo ícone preenchido.
 *
 * "É o começo da aplicação móvel da WeeFly. A mesma estrutura vai receber,
 * mais tarde, outros separadores e outros serviços." Por isso os separadores
 * são uma lista (`VIP_TABS`) e não três blocos escritos à mão: um separador
 * novo é uma linha aqui e uma pasta em `app/pc/[token]/(vip)/` — a navegação
 * não se refaz. A largura reparte-se sozinha (cabem cinco entre 360 e 430 px).
 */

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plane, Ticket, User } from "lucide-react"

import { useT } from "@/i18n/provider"

export interface VipTab {
  /** A pasta do separador, e a chave do nome em `vipApp.tabs`. */
  key: string
  icon: "plane" | "ticket" | "person"
}

export const VIP_TABS: readonly VipTab[] = [
  { key: "pedido", icon: "plane" },
  { key: "passagens", icon: "ticket" },
  { key: "dados", icon: "person" },
]

/**
 * O ícone de um separador: em contorno, ou preenchido no ativo. São os da
 * `lucide-react`, que o resto da aplicação já usa.
 */
function TabIcon({ icon, active }: { icon: VipTab["icon"]; active: boolean }) {
  const Icon = icon === "plane" ? Plane : icon === "ticket" ? Ticket : User
  return (
    <Icon
      aria-hidden
      size={24}
      strokeWidth={active ? 1.6 : 1.9}
      fill={active ? "currentColor" : "none"}
    />
  )
}

export function VipTabBar({
  base,
  attention = 0,
}: {
  /** A raiz da app: `/pc/<nome>-<código>`. */
  base: string
  /** APP-03 · quantos pedidos esperam pelo cliente: o sinal em Minhas passagens. */
  attention?: number
}) {
  const t = useT()
  const pathname = usePathname() ?? ""

  /*
   * APP-05 · o browser oferece a instalação (`beforeinstallprompt`) uma vez,
   * cedo, em qualquer ecrã — e o convite só aparece mais tarde, em Minhas
   * passagens, depois do primeiro pedido. A barra é a única peça que está
   * sempre montada: guarda a oferta para o convite a usar quando chegar a vez.
   */
  useEffect(() => {
    const keep = (event: Event) => {
      event.preventDefault()
      ;(window as unknown as { __weeflyInstall?: Event }).__weeflyInstall = event
      window.dispatchEvent(new Event("weefly:installable"))
    }
    window.addEventListener("beforeinstallprompt", keep)
    return () => window.removeEventListener("beforeinstallprompt", keep)
  }, [])

  return (
    <>
      {/* O espaço que a barra ocupa, para o conteúdo não ficar por baixo dela. */}
      <div style={{ height: 70 }} aria-hidden />
      <nav
        aria-label={t("vipApp.tabs.label")}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          background: "#fff",
          borderTop: "1px solid var(--line)",
          /* A área segura do telemóvel (a barra de gestos do iPhone). */
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div style={{ display: "flex", maxWidth: 540, margin: "0 auto" }}>
          {VIP_TABS.map((tab) => {
            const href = `${base}/${tab.key}`
            const active = pathname === href || pathname.startsWith(`${href}/`)
            const flagged = tab.key === "passagens" && attention > 0
            return (
              <Link
                key={tab.key}
                href={href}
                aria-current={active ? "page" : undefined}
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  padding: "9px 4px 9px",
                  fontSize: 11.5,
                  lineHeight: 1.15,
                  textAlign: "center",
                  fontWeight: active ? 800 : 600,
                  color: active ? "var(--ember)" : "var(--muted)",
                  textDecoration: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <TabIcon icon={tab.icon} active={active} />
                  {flagged && (
                    <span
                      /* O número diz o mesmo a quem não vê a cor. */
                      aria-label={t("vipApp.tabs.attention", { count: attention })}
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -9,
                        minWidth: 17,
                        height: 17,
                        padding: "0 4px",
                        borderRadius: 999,
                        background: "var(--ember)",
                        color: "#fff",
                        fontSize: 10.5,
                        fontWeight: 800,
                        display: "grid",
                        placeItems: "center",
                        border: "2px solid #fff",
                        boxSizing: "content-box",
                      }}
                    >
                      {attention}
                    </span>
                  )}
                </span>
                <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t(`vipApp.tabs.${tab.key}`)}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
