import Link from "next/link"
import { notFound } from "next/navigation"

import { getBoScope } from "@/lib/bo-scope"
import { listAlertRecipients, listOrganisations } from "@/lib/b2g"
import { getBoI18n } from "@/i18n/bo-server"
import { OrganisationList } from "@/components/b2g/org-list"
import { RecipientsEditor } from "@/components/b2g/b2g-forms"

/** ADM-08 · os ministérios de um parceiro, e os destinatários dos alertas (ADM-06). */
export default async function B2gPartnerPage({ params }: { params: { partnerId: string } }) {
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) notFound()
  if (!/^[0-9a-f-]{36}$/i.test(params.partnerId)) notFound()

  const { data: partner } = await scope.db
    .from("partners")
    .select("id, commercial_name")
    .eq("id", params.partnerId)
    .maybeSingle()
  if (!partner) notFound()
  const p = partner as { id: string; commercial_name: string }

  const { t, locale } = await getBoI18n()
  const [orgs, recipients] = await Promise.all([listOrganisations(scope, p.id), listAlertRecipients(p.id)])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/gestao/b2g" className="text-sm text-slate-500 hover:text-slate-900">
          ← {t("bo.b2g.admin.title")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{p.commercial_name}</h1>
        <p className="text-slate-500 mt-1">{t("bo.b2g.admin.readOnly")}</p>
      </div>
      <OrganisationList orgs={orgs} hrefFor={(id) => `/gestao/b2g/m/${id}`} t={t} locale={locale} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-900">{t("bo.b2g.recipients.title")}</h2>
        <RecipientsEditor
          partnerId={p.id}
          recipients={recipients}
          organisations={orgs.map((o) => ({ id: o.id, name: o.name }))}
          sides={["weefly", "partner"]}
        />
      </section>
    </div>
  )
}
