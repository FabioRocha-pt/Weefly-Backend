import { Wallet } from "lucide-react"
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder"
import { OrganisationList } from "@/components/b2g/org-list"
import { getBoI18n } from "@/i18n/bo-server"
import { getBoScope } from "@/lib/bo-scope"
import { listOrganisations } from "@/lib/b2g"
import { partnerHasChannel } from "@/lib/channel-gate"

/**
 * PRO-05 · a Carteira.
 *
 * PAR-03 · "O saldo aparece também na Carteira da Alô, só para consulta." Para
 * um parceiro que vende ao Estado, a Carteira mostra a bolsa de cada
 * ministério; para os outros continua vazia, até haver o que mostrar.
 */
export default async function CarteiraPage() {
  const { t, locale } = await getBoI18n()
  const scope = await getBoScope()
  /* B2G-02 · sem o canal Ministérios, a bolsa dos ministérios não aparece. */
  const sellsB2g = scope?.partnerId ? await partnerHasChannel(scope.partnerId, "B2G") : false
  const orgs = scope?.partnerId && sellsB2g && !scope.identity.tenant?.isOperator ? await listOrganisations(scope) : []

  if (orgs.length === 0) {
    return (
      <SectionPlaceholder
        icon={<Wallet className="w-8 h-8 text-orange-600" />}
        title={t("dashboard.walletTitle")}
        description={t("pro.walletEmpty")}
      />
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("dashboard.walletTitle")}</h1>
        <p className="text-slate-500 mt-1">{t("bo.b2g.wallet.subtitle")}</p>
      </div>
      <OrganisationList orgs={orgs} hrefFor={(id) => `/agente/ministerios/${id}`} t={t} locale={locale} />
    </div>
  )
}
