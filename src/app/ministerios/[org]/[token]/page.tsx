import { notFound } from "next/navigation"

import { RequestWizard } from "@/components/pc/request-wizard"
import { loadSecretarySpace } from "@/lib/ministry"
import { countryOfDial, toE164 } from "@/lib/countries"

/**
 * MIN-01 · Novo pedido — a aba que abre primeiro. O passo 1 do Price Checker
 * (datas, destino, passageiros, percurso); quem pede é conhecido, e por isso o
 * passo do contacto salta-se quando o ministério o tem completo.
 *
 * "Um componente, duas configurações": é o mesmo formulário do link de um
 * cliente particular, com o ministério a dizer quem pede.
 */

export const dynamic = "force-dynamic"

export default async function MinistryNewRequestPage({
  params,
}: {
  params: { org: string; token: string }
}) {
  /* B2G-07 · sem a sessão do PIN desta secretária, nada (a moldura mostra o PIN). */
  const { lookup, signedIn } = await loadSecretarySpace(params.org, params.token)
  if (!lookup.ok) notFound()
  if (!signedIn) return null
  const { org } = lookup.ministry

  /* O telefone da secretária chega como foi escrito ("+238 991 23 45"): o
     formulário quer o país e o número nacional. */
  const raw = (org.secretaryPhone ?? "").replace(/\s+/g, "")
  const dial = raw.startsWith("+") ? raw.match(/^\+\d{1,3}/)?.[0] ?? "+238" : "+238"
  const country = countryOfDial(dial) || "CV"
  const national = raw.startsWith("+") ? raw.slice(dial.length) : raw
  const phoneOk = Boolean(national && toE164(dial, national))

  return (
    <RequestWizard
      initialLang="pt"
      initialCurrency={org.currency}
      initialCountry={country}
      agentSlug={null}
      ministry={{
        token: org.token,
        contact: {
          name: org.secretaryName ?? "",
          email: org.secretaryEmail ?? "",
          country,
          phone: phoneOk ? national : "",
        },
      }}
    />
  )
}
