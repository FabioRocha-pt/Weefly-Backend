import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, Building, FolderOpen, Handshake, Plane } from "lucide-react"

import { getBoScope } from "@/lib/bo-scope"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * OCT-15 · o primeiro menu do Admin: os números que pedem atenção, cada um a
 * abrir a lista de onde vem.
 *
 *   contas à espera de aprovação → Validação de contas
 *   parceiros activos            → Parceiros
 *   casos abertos                → Casos (todos os parceiros)
 *   passagens emitidas no mês    → Números
 *   alertas de saldo (7 dias)    → B2G
 *
 * Contagens só (`head: true`), lidas pela sessão do Admin WeeFly, que vê
 * todos os parceiros. Um número que não se consegue ler mostra "—", não zero.
 */

export const dynamic = "force-dynamic"

function monthStartCv(): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Cape_Verde" }).format(new Date())
  return `${day.slice(0, 7)}-01T00:00:00-01:00`
}

export default async function AdminDashboardPage() {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()
  const { t } = await getBoI18n()
  const db = scope.db

  const count = async (build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await build()
    return error ? null : (n ?? 0)
  }
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  const [pending, partners, open, issued, alerts] = await Promise.all([
    count(() => db.from("pro_accounts").select("user_id", { count: "exact", head: true }).eq("status", "pending")),
    count(() => db.from("partners").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(() => db.from("booking_cases").select("id", { count: "exact", head: true }).is("closed_at", null)),
    count(() =>
      db.from("booking_cases").select("id", { count: "exact", head: true }).gte("issued_at", monthStartCv())
    ),
    count(() => db.from("budget_alerts").select("id", { count: "exact", head: true }).gte("alert_day", weekAgo)),
  ])

  const tiles = [
    { key: "pending", value: pending, href: "/gestao/contas", icon: <Building className="w-5 h-5" />, hot: (pending ?? 0) > 0 },
    { key: "partners", value: partners, href: "/gestao/parceiros", icon: <Handshake className="w-5 h-5" />, hot: false },
    { key: "openCases", value: open, href: "/gestao/casos", icon: <FolderOpen className="w-5 h-5" />, hot: false },
    { key: "issued", value: issued, href: "/gestao/numeros", icon: <Plane className="w-5 h-5" />, hot: false },
    { key: "alerts", value: alerts, href: "/gestao/b2g", icon: <AlertTriangle className="w-5 h-5" />, hot: (alerts ?? 0) > 0 },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.adminDashboard.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.adminDashboard.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className={`rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              tile.hot ? "border-orange-300" : "border-slate-200"
            }`}
          >
            <div className={`flex items-center gap-2 text-sm ${tile.hot ? "text-orange-600" : "text-slate-500"}`}>
              {tile.icon}
              <span>{t(`bo.adminDashboard.${tile.key}`)}</span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{tile.value ?? "—"}</p>
            <p className="mt-1 text-xs text-slate-500">{t(`bo.adminDashboard.${tile.key}Hint`)}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
