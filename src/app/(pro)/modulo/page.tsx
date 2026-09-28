import { Compass, Lock, ShieldCheck, Store } from "lucide-react"

import { enterModule } from "@/actions/pro"
import { getI18n } from "@/i18n/server"
import { cn } from "@/lib/utils"
import {
  moduleState,
  requireApprovedAccount,
  type ProModule,
} from "@/lib/pro-account"

/**
 * PRO-02 · depois do login escolhe-se o módulo. O último usado vem marcado.
 * PRO-03 · Fornecedor aparece com cadeado e "Brevemente", e não é um botão.
 */

const ICON: Record<ProModule, React.ReactNode> = {
  supplier: <Store className="w-6 h-6" />,
  agent: <Compass className="w-6 h-6" />,
  admin: <ShieldCheck className="w-6 h-6" />,
}

const ORDER: ProModule[] = ["supplier", "agent", "admin"]

export default async function ModuloPage() {
  const { t } = getI18n()
  const account = await requireApprovedAccount()

  const modules = ORDER.map((id) => ({ id, state: moduleState(account, id) })).filter(
    (m) => m.state !== "hidden"
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 mb-2">
          {t("pro.chooseEyebrow")}
        </p>
        <h1 className="text-3xl font-bold text-slate-900">{t("pro.chooseTitle")}</h1>
        <p className="text-slate-500 mt-2">{t("pro.chooseSubtitle")}</p>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          modules.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
        )}
      >
        {modules.map(({ id, state }) => {
          const last = account.lastModule === id
          const body = (
            <>
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    state === "open" ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-400"
                  )}
                >
                  {ICON[id]}
                </div>
                {state === "soon" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    <Lock className="w-3.5 h-3.5" />
                    {t("pro.soon")}
                  </span>
                ) : last ? (
                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">
                    {t("pro.lastUsed")}
                  </span>
                ) : null}
              </div>
              <h2 className={cn("mt-4 font-bold", state === "open" ? "text-slate-900" : "text-slate-400")}>
                {t(`pro.module.${id}`)}
              </h2>
              <p className="text-sm text-slate-500 mt-1">{t(`pro.moduleBody.${id}`)}</p>
            </>
          )

          const card = "w-full h-full text-left rounded-2xl border bg-white p-6 transition-all"

          if (state !== "open") {
            return (
              <div
                key={id}
                aria-disabled="true"
                className={cn(card, "border-slate-200 opacity-80 cursor-not-allowed")}
              >
                {body}
              </div>
            )
          }

          return (
            <form key={id} action={enterModule}>
              <input type="hidden" name="module" value={id} />
              <button
                type="submit"
                autoFocus={last}
                className={cn(
                  card,
                  "hover:shadow-md hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                  last ? "border-orange-300" : "border-slate-200"
                )}
              >
                {body}
              </button>
            </form>
          )
        })}
      </div>
    </div>
  )
}
