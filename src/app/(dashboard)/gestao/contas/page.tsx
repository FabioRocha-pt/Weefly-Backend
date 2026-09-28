import { ShieldCheck } from "lucide-react"

import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { AccountReview } from "@/components/pro/account-review"
import { loadAccountsReview } from "@/lib/pro-admin"

/**
 * PRO-09 · contas à espera de validação, no módulo Admin da conta master.
 *
 * Em português, como o resto do back-office: o L-05 (back-office em português
 * e inglês) é da semana seguinte e trata tudo de uma vez.
 */
export default async function ContasPage() {
  const review = await loadAccountsReview()

  if (!review) {
    return (
      <SectionPlaceholder
        icon={<ShieldCheck className="w-8 h-8 text-orange-600" />}
        title="Validação de contas"
        description="Não foi possível ler as contas. Confirme que a migração 0022 está aplicada."
      />
    )
  }

  const dt = new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Validação de contas</h1>
        <p className="text-slate-500 mt-1">
          Uma conta nova não entra em nenhum módulo até ser aprovada aqui.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Pendentes · {review.pending.length}
        </h2>
        {review.pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
            Nenhuma conta à espera.
          </p>
        ) : (
          review.pending.map((account) => (
            <AccountReview
              key={account.userId}
              account={{ ...account, createdLabel: dt.format(new Date(account.createdAt)) }}
              partners={review.partners.map((p) => ({
                id: p.id,
                name: p.name,
                isOperator: p.isOperator,
                sellMode: p.sellMode,
                sellEnabled: p.sellEnabled,
                agentMenus: p.agentMenus,
              }))}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Registo de decisões
        </h2>
        {review.decisions.length === 0 ? (
          <p className="text-slate-500 text-sm">Ainda não há decisões registadas.</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Data</th>
                  <th className="px-5 py-3 font-semibold">Conta</th>
                  <th className="px-5 py-3 font-semibold">Decisão</th>
                  <th className="px-5 py-3 font-semibold">Empresa / motivo</th>
                  <th className="px-5 py-3 font-semibold">Quem decidiu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {review.decisions.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600">
                      {dt.format(new Date(d.createdAt))}
                    </td>
                    <td className="px-5 py-3">{d.email ?? d.userId.slice(0, 8)}</td>
                    <td className="px-5 py-3">
                      {d.decision === "approved" ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Aprovada
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Recusada
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {d.decision === "approved" ? d.partnerName ?? "—" : d.reason ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{d.decidedByEmail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
