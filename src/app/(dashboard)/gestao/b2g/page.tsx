import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { listOrganisationRequests, listOrganisations } from "@/lib/b2g"
import { PendingRequestRow } from "@/components/b2g/ministry-requests"
import { formatAmount } from "@/lib/case-status"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * ADM-08 · o espaço B2G do Admin: todas as vendas ao Estado, de todos os
 * parceiros. Só leitura por defeito.
 *
 * B2G-23 · em cima, os ministérios pedidos pelas empresas, à espera do
 * master: aprovar (com o endereço editável) ou recusar com motivo.
 *
 * Nunca visível a contas de parceiros: o módulo Admin já é só do perfil Admin
 * WeeFly, e esta página volta a perguntar (404 a quem não vê todos).
 */
export default async function B2gPage() {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()
  const { t } = await getBoI18n()

  const { data } = await scope.db
    .from("partners")
    .select("id, slug, commercial_name, status, channels")
    .contains("channels", ["B2G"])
    .order("commercial_name")
  const pending = await listOrganisationRequests(scope, { status: "pending" })
  const partners = (data ?? []) as { id: string; slug: string; commercial_name: string; status: string }[]

  const rows = await Promise.all(
    partners.map(async (p) => {
      const orgs = await listOrganisations(scope, p.id)
      const { data: movements } = await scope.db
        .from("budget_movements")
        .select("kind, delta")
        .eq("partner_id", p.id)
        .in("kind", ["debit", "reversal"])
      /* O emitido é o que a bolsa pagou: débitos menos estornos. */
      const issued = -((movements ?? []) as { delta: number }[]).reduce((s, m) => s + Number(m.delta), 0)
      return {
        ...p,
        ministries: orgs.length,
        balance: orgs.reduce((s, o) => s + o.balance, 0),
        issued,
        currency: orgs[0]?.currency ?? "CVE",
      }
    })
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.b2g.admin.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.b2g.admin.subtitle")}</p>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t("bo.ministryRequests.pendingTitle")} · {pending.length}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">{t("bo.ministryRequests.pendingEmpty")}</p>
        ) : (
          <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {pending.map((r) => (
              <PendingRequestRow key={r.id} request={r} />
            ))}
          </ul>
        )}
      </section>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
          {t("bo.b2g.admin.noPartners")}
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("bo.b2g.admin.partner")}</th>
                <th className="px-4 py-3">{t("bo.b2g.admin.status")}</th>
                <th className="px-4 py-3 text-right">{t("bo.b2g.admin.ministries")}</th>
                <th className="px-4 py-3 text-right">{t("bo.b2g.admin.issued")}</th>
                <th className="px-4 py-3 text-right">{t("bo.b2g.admin.balances")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link href={`/gestao/b2g/${r.id}`} className="font-medium text-slate-900 hover:text-orange-700">
                      {r.commercial_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{t(`bo.b2g.admin.statusValue.${r.status}`)}</td>
                  <td className="px-4 py-3 text-right">{r.ministries}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatAmount(r.issued, r.currency)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatAmount(r.balance, r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
