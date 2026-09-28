import Link from "next/link"
import { ArrowRight, Car, Home, Lock, Plane, Sparkles, UtensilsCrossed, Users, Wallet } from "lucide-react"

import { getCurrentUser } from "@/lib/current-user"
import { getProAccount, visibleAgentMenus, type AgentMenu } from "@/lib/pro-account"
import { AGENT_MENU_HREF } from "@/lib/pro-menus"
import { getI18n } from "@/i18n/server"
import { cn } from "@/lib/utils"

/**
 * PRO-04 · o início do módulo Agente: os menus que a empresa tem ligados.
 *
 * Os números que aqui estavam eram inventados (12 pedidos, 48 clientes, uma
 * carteira de 125 000). Saíram: num produto a ser testado, um número falso é
 * pior do que nenhum.
 */

const ICON: Record<AgentMenu, React.ReactNode> = {
  flights: <Plane className="w-6 h-6" />,
  cars: <Car className="w-6 h-6" />,
  houses: <Home className="w-6 h-6" />,
  experiences: <Sparkles className="w-6 h-6" />,
  food: <UtensilsCrossed className="w-6 h-6" />,
}

export default async function AgentHomePage() {
  const { t } = getI18n()
  const [account, user] = await Promise.all([getProAccount(), getCurrentUser()])
  const firstName = user?.firstName || user?.fullName || t("dashboard.fallbackName")
  const menus = account ? visibleAgentMenus(account) : []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 mb-1">
          {t("nav.agentArea")}
        </p>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("dashboard.greeting", { name: firstName })}
        </h1>
        <p className="text-slate-500 mt-1">{t("pro.agentSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {menus.map(({ menu, state }) => {
          const open = state === "open"
          return (
            <Link
              key={menu}
              href={AGENT_MENU_HREF[menu]}
              className={cn(
                "group rounded-2xl border bg-white p-6 transition-all",
                open ? "border-slate-200 hover:shadow-md hover:border-slate-300" : "border-dashed border-slate-300"
              )}
            >
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    open ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-400"
                  )}
                >
                  {ICON[menu]}
                </div>
                {!open && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    <Lock className="w-3.5 h-3.5" />
                    {t("pro.soon")}
                  </span>
                )}
              </div>
              <h3 className={cn("mt-4 font-bold", open ? "text-slate-900" : "text-slate-400")}>
                {t(`pro.menu.${menu}`)}
              </h3>
              <p className="text-sm text-slate-500 mt-1">{t(`pro.menuBody.${menu}`)}</p>
              {open && (
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-orange-600">
                  {t("pro.open")}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/agente/clientes"
          className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 hover:shadow-md transition-all"
        >
          <Users className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-900">{t("nav.clients")}</span>
        </Link>
        <Link
          href="/agente/carteira"
          className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 hover:shadow-md transition-all"
        >
          <Wallet className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-900">{t("nav.wallet")}</span>
        </Link>
      </div>
    </div>
  )
}
