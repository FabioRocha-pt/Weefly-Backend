import { notFound } from "next/navigation"

import { loadAccessAdmin } from "@/lib/access-admin"
import { PartnersAdmin } from "@/components/pro/partners-admin"

/**
 * ADM-01 · o registo de parceiros. Só o Admin WeeFly: a política
 * `partners_admin_write` recusa as escritas a qualquer outro, e esta página
 * responde 404 a quem não vê todos os parceiros.
 */
export default async function ParceirosPage() {
  const data = await loadAccessAdmin()
  if (!data || data.actor.manageUsers !== "all" || !data.actor.crossPartner) notFound()

  const counts = new Map<string, { users: number; active: number }>()
  for (const u of data.users) {
    const c = counts.get(u.partnerId) ?? { users: 0, active: 0 }
    c.users += 1
    if (u.active) c.active += 1
    counts.set(u.partnerId, c)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Parceiros</h1>
        <p className="text-slate-500 mt-1">
          Criar um parceiro cria a primeira conta de administrador e envia o convite. Suspender não
          apaga: bloqueia o login e congela os links.
        </p>
      </div>
      <PartnersAdmin
        partners={data.partners.map((p) => ({
          ...p,
          users: counts.get(p.id)?.users ?? 0,
          activeUsers: counts.get(p.id)?.active ?? 0,
        }))}
      />
    </div>
  )
}
