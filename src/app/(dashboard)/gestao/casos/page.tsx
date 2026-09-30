import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * ADM-04 · todos os dados dos parceiros, só para o Admin: primeiro o parceiro,
 * depois o ministério, depois o caso. Só leitura — intervir é uma ação à
 * parte, na ficha do caso.
 *
 * Nunca visível a contas de parceiros: o módulo Admin já é só do Admin WeeFly,
 * e esta página volta a perguntar (404 a quem não vê todos).
 */
export default async function AdminCasesPage() {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()
  const { t } = await getBoI18n()

  const { data } = await scope.db
    .from("partners")
    .select("id, commercial_name, status, is_operator")
    .order("is_operator", { ascending: false })
    .order("commercial_name")
  const partners = (data ?? []) as { id: string; commercial_name: string; status: string; is_operator: boolean }[]

  const count = async (table: string, build: (q: any) => any) => {
    const { count: n } = await build(scope.db.from(table).select("id", { count: "exact", head: true }))
    return n ?? 0
  }

  const rows = await Promise.all(
    partners.map(async (p) => ({
      ...p,
      cases: await count("booking_cases", (q) => q.eq("partner_id", p.id)),
      issued: await count("booking_cases", (q) => q.eq("partner_id", p.id).not("issued_at", "is", null)),
      ministries: await count("organisations", (q) => q.eq("partner_id", p.id)),
    }))
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.adminCases.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.adminCases.subtitle")}</p>
      </div>
      <p className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">{t("bo.adminCases.readOnly")}</p>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("bo.adminCases.partner")}</th>
              <th className="px-4 py-3">{t("bo.adminCases.status")}</th>
              <th className="px-4 py-3 text-right">{t("bo.adminCases.ministries")}</th>
              <th className="px-4 py-3 text-right">{t("bo.adminCases.cases")}</th>
              <th className="px-4 py-3 text-right">{t("bo.adminCases.issued")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link href={`/gestao/casos/${r.id}`} className="font-medium text-slate-900 hover:text-orange-700">
                    {r.commercial_name}
                  </Link>
                  {r.is_operator && <span className="ml-2 text-xs text-slate-500">{t("bo.adminCases.operator")}</span>}
                </td>
                <td className="px-4 py-3">{t(`bo.b2g.admin.statusValue.${r.status}`)}</td>
                <td className="px-4 py-3 text-right">{r.ministries}</td>
                <td className="px-4 py-3 text-right">{r.cases}</td>
                <td className="px-4 py-3 text-right">{r.issued}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
