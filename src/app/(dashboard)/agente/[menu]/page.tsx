import { notFound, redirect } from "next/navigation"
import { Car, Home, Lock, Sparkles, UtensilsCrossed } from "lucide-react"

import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { AGENT_MENU_HREF } from "@/lib/pro-menus"
import { agentMenuState, getProAccount, type AgentMenu } from "@/lib/pro-account"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * PRO-04 · os menus do Agente que ainda não têm conteúdo.
 *
 * Desligado para a empresa: não existe (404), mesmo pelo endereço directo.
 * Ligado sem conteúdo: "Brevemente". Passagens tem conteúdo e é o Concierge.
 */

const SLUG_TO_MENU: Record<string, AgentMenu> = {
  passagens: "flights",
  carros: "cars",
  casas: "houses",
  experiencias: "experiences",
  comida: "food",
}

const ICON: Record<Exclude<AgentMenu, "flights">, React.ReactNode> = {
  cars: <Car className="w-8 h-8 text-slate-400" />,
  houses: <Home className="w-8 h-8 text-slate-400" />,
  experiences: <Sparkles className="w-8 h-8 text-slate-400" />,
  food: <UtensilsCrossed className="w-8 h-8 text-slate-400" />,
}

export default async function AgentMenuPage({ params }: { params: { menu: string } }) {
  const menu = SLUG_TO_MENU[params.menu]
  if (!menu) notFound()

  const account = await getProAccount()
  if (!account) redirect("/login")

  const state = agentMenuState(account, menu)
  if (state === "hidden") notFound()
  if (menu === "flights" || state === "open") redirect(AGENT_MENU_HREF[menu])

  const { t } = await getBoI18n()
  return (
    <SectionPlaceholder
      icon={ICON[menu] ?? <Lock className="w-8 h-8 text-slate-400" />}
      title={`${t(`pro.menu.${menu}`)} · ${t("pro.soon")}`}
      description={t("pro.menuSoonBody")}
    />
  )
}
