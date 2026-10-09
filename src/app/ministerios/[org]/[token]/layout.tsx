import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PcBrandProvider, PcFab, PcFooter, ToastHost } from "@/components/pc/chrome"
import { MinistryTabBar } from "@/components/ministry/tab-bar"
import { brandCssVars, toClientBrand } from "@/lib/brand"
import { loadSecretarySpace, resolveMinistry } from "@/lib/ministry"
import { MinistryLeaveButton, MinistryPinScreen } from "@/components/ministry/pin-screen"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary } from "@/i18n/server"

/**
 * MIN-01 · a moldura da aplicação do ministério: a marca do parceiro com o
 * brasão (MIN-02), o WhatsApp do parceiro (MIN-04), a barra inferior fixa e o
 * manifesto para instalar como aplicação (MIN-06).
 *
 * Em português: é a língua dos ministérios de Cabo Verde, e a secretária não
 * tem de escolher nada.
 *
 * Um ministério ou um link desconhecido dá "não encontrado" (TEN-04) — nunca
 * um erro técnico.
 *
 * B2G-07 · o link é pessoal (uma secretária) e não basta: sem sessão aberta
 * com o PIN dela, a moldura mostra o ecrã do PIN e nada das páginas (que
 * também verificam a sessão por si — ver `loadSecretarySpace`).
 */

export const dynamic = "force-dynamic"

type Params = { params: { org: string; token: string } }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const lookup = await resolveMinistry(params.org, params.token)
  if (!lookup.ok) return { title: "—" }
  const { org, brand } = lookup.ministry
  return {
    title: `${org.name} · ${brand.name}`,
    manifest: `/ministerios/${org.slug}/${org.token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: org.name, statusBarStyle: "default" },
    robots: { index: false, follow: false },
  }
}

export default async function MinistryLayout({ params, children }: Params & { children: React.ReactNode }) {
  const { lookup, signedIn } = await loadSecretarySpace(params.org, params.token)
  if (!lookup.ok) notFound()
  const { org, brand, secretary } = lookup.ministry
  const base = `/ministerios/${org.slug}/${org.token}`

  return (
    <I18nProvider locale="pt" dictionary={getDictionary("pt")}>
      <PcBrandProvider brand={toClientBrand(brand)} cssVars={brandCssVars(brand)}>
        <ToastHost>
          {/* O botão do WhatsApp fica por cima da barra inferior, não atrás. */}
          <style>{".fab{bottom:calc(88px + env(safe-area-inset-bottom))!important}"}</style>
          {signedIn ? (
            <>
              {children}
              <MinistryLeaveButton orgSlug={org.slug} linkToken={org.token} />
              <PcFooter />
              <PcFab />
              <MinistryTabBar base={base} />
            </>
          ) : (
            <>
              <MinistryPinScreen
                orgSlug={org.slug}
                linkToken={org.token}
                ministryName={org.name}
                logoUrl={org.logoUrl}
                crestUrl={org.crestUrl}
                secretaryName={secretary.name}
              />
              <PcFooter />
              <PcFab />
            </>
          )}
        </ToastHost>
      </PcBrandProvider>
    </I18nProvider>
  )
}
