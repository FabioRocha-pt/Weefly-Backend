import Link from "next/link"
import { notFound } from "next/navigation"

import { PcScreenRouter } from "@/components/pc/screen-router"
import { VipLiveRefresh } from "@/components/vip/live-refresh"
import { resolveVipHandle, vipLocale } from "@/lib/vip"
import { loadVipCase } from "@/lib/vip-trips"
import { maskEmail, maskPhone } from "@/lib/vip-address"
import { touchLink } from "@/lib/pc/state"
import { getTranslator } from "@/i18n/server"

/**
 * APP-03 · um pedido, dentro da app do cliente VIP.
 *
 * "Cada pedido abre o seu acompanhamento dentro da app: as ofertas, a
 * escolha, os passageiros, o pagamento e o bilhete. O cliente escolhe a
 * oferta aqui, sem o link do email."
 *
 * São os mesmos ecrãs do `/pc/<token>` (`PcScreenRouter`), com três
 * diferenças, todas no estado e nenhuma nos ecrãs:
 *   · `selfPath` · os links dos próprios ecrãs (trocar de oferta, rever os
 *     passageiros) ficam dentro da app;
 *   · `vip` · os dados de Meus dados preenchem o primeiro passageiro (APP-04);
 *   · a língua é a da app — a do cliente — e não a que ficou no pedido (E4).
 *
 * Só um caso deste cliente: o token de outro pedido não existe aqui (404). O
 * link do email (`/pc/<token>`) redirecciona para esta página.
 */

export const dynamic = "force-dynamic"

export default async function VipCasePage({
  params,
  searchParams,
}: {
  params: { token: string; caseToken: string }
  searchParams: { view?: string | string[] }
}) {
  const lookup = await resolveVipHandle(params.token)
  if (!lookup.ok) notFound()
  const context = lookup.context

  const loaded = await loadVipCase(context.vip.id, params.caseToken)
  if (!loaded) notFound()

  const locale = vipLocale(context)
  const t = getTranslator(locale)
  const base = `/pc/${params.token}`
  const profile = context.vip.profile

  const state = {
    ...loaded,
    /* VIP-01 · "telefone e email mascarados no ecrã": os ecrãs do pedido
       repetem o contacto ("avisamos no … e em …"), e na app ele aparece como
       em Meus dados. Só o que se mostra: as ações leem o caso no servidor. */
    contact: {
      ...loaded.contact,
      email: maskEmail(loaded.contact.email),
      dialCode: "",
      phone: maskPhone(loaded.contact.phoneE164 ?? `${loaded.contact.dialCode}${loaded.contact.phone}`),
      phoneE164: null,
    },
    selfPath: `${base}/passagens/${loaded.token}`,
    vip: {
      handle: params.token,
      profile: {
        title: profile.title,
        givenNames: profile.givenNames,
        surname: profile.surname,
        birthDate: profile.birthDate,
        gender: profile.gender,
        nationality: profile.nationality,
        passportNumber: profile.passportNumber,
        passportExpiry: profile.passportExpiry,
        issuingCountry: profile.issuingCountry,
      },
    },
  }

  /* A primeira abertura de cada etapa, para o back-office saber se o cliente
     já viu o que lhe foi enviado — como no `/pc/<token>`. */
  const stage = state.screen === "p5" || state.screen === "p4b" ? 2 : state.screen.startsWith("p7") ? 3 : 1
  void touchLink(loaded, stage as 1 | 2 | 3)

  const view = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view

  return (
    <>
      <VipLiveRefresh />
      <PcScreenRouter state={state} forceView={view} locale={locale} hideLang />
      <div className="shell" style={{ marginTop: 14 }}>
        <Link
          href={`${base}/passagens`}
          className="btn btn-ghost btn-sm"
          style={{ width: "100%", textDecoration: "none" }}
        >
          ‹ {t("vipApp.trips.backToList")}
        </Link>
      </div>
    </>
  )
}
