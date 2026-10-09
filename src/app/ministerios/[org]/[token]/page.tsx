import { notFound } from "next/navigation"

import { MinistryRequestForm } from "@/components/ministry/request-form"
import { airportByIata } from "@/lib/airports"
import { loadSecretarySpace } from "@/lib/ministry"

/**
 * MIN-01 · B2G-09 · Novo pedido — a aba que abre primeiro.
 *
 * Já não é o passo 1 do Price Checker: o ministério tem o formulário simples
 * (pessoas, de onde, para onde, datas, urgência, notas). Quem pede é a
 * secretária da sessão, e por isso não há passo do contacto nem dados de
 * passageiros aqui.
 */

export const dynamic = "force-dynamic"

/** D-1 · "Origem com a Praia por defeito, editável". */
const DEFAULT_ORIGIN = "RAI"

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

  const praia = airportByIata(DEFAULT_ORIGIN)

  return (
    <MinistryRequestForm
      orgSlug={org.slug}
      linkToken={org.token}
      currency={org.currency}
      defaultOrigin={
        praia
          ? { iata: praia.iata, city: praia.city, name: praia.name, country: praia.country, countryName: praia.countryName }
          : null
      }
    />
  )
}
