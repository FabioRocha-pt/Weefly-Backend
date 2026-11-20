import { notFound } from "next/navigation"

import { PcTopbar } from "@/components/pc/chrome"
import { VipProfileCard } from "@/components/vip/profile-card"
import { resolveVipHandle, vipLocale } from "@/lib/vip"
import { WA_NUMBER } from "@/lib/pc/catalog"
import { splitPhone } from "@/lib/countries"
import { getTranslator } from "@/i18n/server"

/**
 * APP-04 · Meus dados — o terceiro separador da app do cliente VIP.
 *
 * Três grupos: o contacto (telefone com indicativo, email), os dados para a
 * passagem (como no passaporte) e as preferências (a língua da app). E, por
 * baixo, a empresa que acompanha o cliente, com o WhatsApp e o email de
 * contacto.
 *
 * O que o cliente guardar aqui preenche o primeiro passageiro de cada pedido
 * (`ScreenP7`), e cada alteração fica registada, com a data, para o agente a
 * ver na ficha do cliente (`vip_client_changes`).
 */

export const dynamic = "force-dynamic"

export default async function VipDataPage({ params }: { params: { token: string } }) {
  const lookup = await resolveVipHandle(params.token)
  if (!lookup.ok) notFound()
  const context = lookup.context
  const { vip, partner, brand } = context
  const locale = vipLocale(context)
  const t = getTranslator(locale)

  const { iso: country, national } = splitPhone(vip.phone, partner.country ?? "CV")
  const p = vip.profile

  /* O WhatsApp da empresa; na WeeFly Global, sem número próprio, o da WeeFly. */
  const whatsapp = (partner.whatsapp ?? "").replace(/\D/g, "") || (partner.isOperator ? WA_NUMBER : "")

  return (
    <>
      <PcTopbar currency="EUR" lang={locale} hideLang hideCurrency />

      <main className="shell view">
        <section className="hero">
          <span className="eyebrow">{brand.name}</span>
          <h1>{t("vipApp.data.title")}</h1>
          <p>{t("vipApp.data.lead", { name: vip.name })}</p>
        </section>

        <VipProfileCard
          /* Voltar a montar quando os dados mudam: o formulário recomeça do
             que ficou gravado, e não do que estava escrito antes. */
          key={`${p.updatedAt ?? ""}:${locale}`}
          handle={params.token}
          locale={locale}
          hasConsent={Boolean(p.passportConsentAt)}
          initial={{
            country,
            phone: national,
            email: vip.email ?? "",
            title: p.title ?? "",
            givenNames: p.givenNames ?? "",
            surname: p.surname ?? "",
            birthDate: p.birthDate ?? "",
            gender: p.gender ?? "",
            nationality: p.nationality ?? "",
            passportNumber: p.passportNumber ?? "",
            passportExpiry: p.passportExpiry ?? "",
            issuingCountry: p.issuingCountry ?? "",
          }}
        />

        {/* "A empresa que acompanha o cliente, com o WhatsApp e o email de contacto." */}
        <div className="card">
          <div className="sechead">
            <h3>{t("vipApp.data.company")}</h3>
          </div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>{partner.name}</p>
          <p className="subnote" style={{ textAlign: "left", marginTop: 4 }}>
            {t("vipApp.data.companyNote")}
          </p>
          {whatsapp && (
            <a
              className="btn btn-wa btn-sm"
              style={{ marginTop: 12, textDecoration: "none" }}
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              WhatsApp · <span className="mono">+{whatsapp}</span>
            </a>
          )}
          {partner.email && (
            <a
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10, width: "100%", textDecoration: "none", overflowWrap: "anywhere" }}
              href={`mailto:${partner.email}`}
            >
              {partner.email}
            </a>
          )}
        </div>

        <div className="spacer" />
      </main>
    </>
  )
}
