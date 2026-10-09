import { notFound } from "next/navigation"

import { PcTopbar } from "@/components/pc/chrome"
import { MinistryTravellerForm } from "@/components/ministry/traveller-form"
import { loadMinistryTravellerCard, loadSecretarySpace } from "@/lib/ministry"
import { getTranslator } from "@/i18n/server"

/**
 * B2G-25 · corrigir uma ficha de passageiro do ministério. Só com a sessão do
 * PIN, e só uma ficha deste ministério (a de outro dá 404). Cada correcção
 * fica no histórico (`ministry_traveller_changes`) com a secretária e a hora —
 * e é esse histórico que o Admin vê.
 */

export const dynamic = "force-dynamic"

export default async function MinistryTravellerPage({
  params,
}: {
  params: { org: string; token: string; travellerId: string }
}) {
  const { lookup, signedIn } = await loadSecretarySpace(params.org, params.token)
  if (!lookup.ok) notFound()
  if (!signedIn) return null
  const { org } = lookup.ministry

  const traveller = await loadMinistryTravellerCard(org.id, params.travellerId)
  if (!traveller) notFound()
  const t = getTranslator("pt")
  const back = `/ministerios/${org.slug}/${org.token}/passageiros`

  return (
    <>
      <PcTopbar currency={org.currency} lang="pt" />
      <main className="shell" style={{ paddingTop: 20 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{t("ministry.travellers.editTitle")}</h1>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 14 }}>
          {traveller.lastName.toUpperCase()}, {traveller.firstName}
        </p>
        {traveller.passportWarning && (
          <p
            role="note"
            style={{
              margin: "0 0 12px",
              display: "inline-block",
              background: traveller.passportWarning === "expired" ? "#FEE2E2" : "#FEF3C7",
              color: traveller.passportWarning === "expired" ? "#B91C1C" : "#92400E",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            ⚠ {t(`ministry.travellers.${traveller.passportWarning}`)}
          </p>
        )}
        <MinistryTravellerForm orgSlug={org.slug} linkToken={org.token} traveller={traveller} backHref={back} />
      </main>
    </>
  )
}
