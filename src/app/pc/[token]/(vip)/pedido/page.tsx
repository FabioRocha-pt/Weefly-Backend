import { notFound } from "next/navigation"

import { RequestWizard } from "@/components/pc/request-wizard"
import { resolveVipHandle, vipLocale } from "@/lib/vip"
import { vipFirstName, vipHomeCity } from "@/lib/vip-address"
import { CURRENCIES } from "@/lib/pc/catalog"
import { COUNTRY_BY_ISO, splitPhone, toE164 } from "@/lib/countries"

/**
 * APP-02 · Fazer pedido — o primeiro separador da app do cliente VIP.
 *
 *   · a saudação com o primeiro nome ("Olá, João"), sobre a imagem da cidade
 *     de partida, que passa para a de destino quando esta é escolhida (IMG-01);
 *   · o formulário da viagem do price checker: tipo, passageiros, classe,
 *     bagagem, de, para, datas;
 *   · **sem passo de contactos** (E3): os contactos vêm do cliente;
 *   · depois, o resumo, com os pedidos especiais e o consentimento;
 *   · ao enviar, a app passa para Minhas passagens, com o pedido novo em cima.
 *
 * O pedido entra na fila VIP da empresa: o intake resolve o token do cliente,
 * e nem o VIP nem a empresa vêm do browser. A língua do pedido é a da app —
 * e é ela que os emails e o acompanhamento usam (E4).
 */

export const dynamic = "force-dynamic"

type Props = {
  params: { token: string }
  searchParams: Record<string, string | string[] | undefined>
}

export default async function VipRequestPage({ params, searchParams }: Props) {
  const lookup = await resolveVipHandle(params.token)
  if (!lookup.ok) notFound()
  const { vip, partner } = lookup.context
  const locale = vipLocale(lookup.context)

  /* O telefone do cliente está guardado no formato internacional (E7); os
     antigos, como foram escritos ("+238 991 23 45"). O formulário quer o país
     e o número nacional — `splitPhone` é o inverso do `toE164`. */
  const { iso: country, national } = splitPhone(vip.phone, "CV")
  const dial = COUNTRY_BY_ISO[country]?.dial ?? "+238"
  const phoneOk = Boolean(national && toE164(dial, national))

  const one = (key: string): string => {
    const value = searchParams[key]
    return (Array.isArray(value) ? value[0] : value) ?? ""
  }
  const askedCurrency = one("currency").toUpperCase()
  const currency = CURRENCIES.includes(askedCurrency)
    ? askedCurrency
    : country === "CV" && CURRENCIES.includes("CVE")
      ? "CVE"
      : "EUR"

  return (
    <RequestWizard
      initialLang={locale}
      initialCurrency={currency}
      initialCountry={COUNTRY_BY_ISO[country] ? country : null}
      agentSlug={null}
      vip={{
        token: vip.token,
        appBase: `/pc/${params.token}`,
        firstName: vipFirstName(vip.name),
        homeCity: vipHomeCity(partner.country),
        contact: {
          name: vip.name,
          email: vip.email ?? "",
          country,
          phone: phoneOk ? national : "",
        },
      }}
    />
  )
}
