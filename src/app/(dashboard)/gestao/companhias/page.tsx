import { notFound } from "next/navigation"

import { boIdentity } from "@/lib/bo-access"
import { createAdminClient } from "@/utils/supabase/admin"
import { hasAirlineLogo, airlineLogoPath } from "@/lib/airlines-catalog"
import { AirlinesAdmin, type AirlineRowView } from "@/components/pro/airlines-admin"
import { getBoI18n } from "@/i18n/bo-server"

/**
 * Admin · as companhias aéreas: nome, logótipo, prefixo do bilhete e ordem no
 * seletor. Só o Admin WeeFly — a server action volta a verificar.
 */
export default async function CompanhiasPage() {
  const identity = await boIdentity()
  if (!identity?.profile || identity.profile.manageUsers !== "all" || !identity.profile.crossPartner) notFound()

  const { t } = await getBoI18n()
  const admin = createAdminClient()
  const { data } = admin ? await admin.from("airlines").select("*") : { data: null }

  const airlines: AirlineRowView[] = ((data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const iata = String(r.iata).toUpperCase()
      const logoUrl = typeof r.logo_url === "string" && r.logo_url ? r.logo_url : null
      return {
        iata,
        name: String(r.name),
        priority: Number(r.priority) || 9,
        active: r.active !== false,
        ticketPrefix: typeof r.ticket_prefix === "string" ? r.ticket_prefix : null,
        logoUrl,
        /* O que se vê: o carregado no Admin, ou o ficheiro que já vinha no pacote. */
        shownLogo: logoUrl ?? (hasAirlineLogo(iata) ? airlineLogoPath(iata) : null),
      }
    })
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "pt"))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("bo.airlines.title")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.airlines.subtitle")}</p>
      </div>
      <AirlinesAdmin airlines={airlines} />
    </div>
  )
}
