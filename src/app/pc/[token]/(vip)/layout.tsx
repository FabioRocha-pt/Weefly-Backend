import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"

import { PcBrandProvider, PcFab, PcFooter, ToastHost } from "@/components/pc/chrome"
import { VipTabBar } from "@/components/vip/app-tab-bar"
import { brandCssVars, toClientBrand } from "@/lib/brand"
import { resolveVipHandle, vipLocale } from "@/lib/vip"
import { loadVipTrips } from "@/lib/vip-trips"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary } from "@/i18n/server"
import { DEFAULT_LOCALE } from "@/i18n/config"

/**
 * APP-01 · a moldura da app do cliente VIP: `/pc/<nome>-<código>/…`.
 *
 * "O VIP passa a ser uma pequena aplicação, com três separadores em baixo:
 * Fazer pedido, Minhas passagens e Meus dados. É o começo da aplicação móvel
 * da WeeFly."
 *
 * O que a moldura dá a todos os separadores:
 *   · a marca da empresa que criou o VIP (logótipo, cores, e "Powered by
 *     WeeFly" nos parceiros) — o `PcBrandProvider`, como no `/pc`;
 *   · a língua do cliente: a que ele escolheu em Meus dados, senão a da
 *     empresa (`vipLocale`). Não se lê o browser nem o cookie do site: o E4
 *     foi um acompanhamento em inglês num pedido em português;
 *   · a barra inferior, fixa (`VipTabBar`), com o sinal dos pedidos que
 *     esperam pelo cliente;
 *   · o manifesto para instalar no telemóvel (APP-05), com o link pessoal
 *     como `start_url` — o cliente não precisa de o voltar a abrir pelo
 *     WhatsApp.
 *
 * Um separador novo é uma pasta ao lado destas e uma linha em `VIP_TABS`.
 *
 * VIP-01 · um endereço que não é de um VIP ativo dá "não encontrado", sem
 * dizer porquê: desativado, empresa sem o canal VIP, ou o endereço de outra
 * empresa. (O token de um pedido não chega aqui: `/pc/<token>` é a página ao
 * lado, e não tem separadores por baixo.)
 */

export const dynamic = "force-dynamic"

type Params = { params: { token: string } }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const lookup = await resolveVipHandle(params.token)
  if (!lookup.ok) return { title: "—", robots: { index: false, follow: false } }
  const { brand } = lookup.context
  const base = `/pc/${params.token}`
  const v = `?v=${brand.kind === "partner" ? brand.brandVersion : 1}`
  return {
    /* APP-05 · "com o ícone e o nome da empresa". */
    title: { absolute: brand.name },
    applicationName: brand.name,
    manifest: `${base}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
    icons: {
      icon: [
        { url: `/favicon-32x32.png${v}`, sizes: "32x32", type: "image/png" },
        { url: `/icon-192.png${v}`, sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: `/apple-touch-icon.png${v}`, sizes: "180x180", type: "image/png" }],
    },
    /* Um link pessoal não se indexa, e não mostra de quem é numa partilha. */
    robots: { index: false, follow: false },
  }
}

/* `viewport-fit=cover` é o que faz o `env(safe-area-inset-bottom)` da barra
   ter valor num iPhone com a app instalada. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function VipAppLayout({ params, children }: Params & { children: React.ReactNode }) {
  const lookup = await resolveVipHandle(params.token)
  if (!lookup.ok) notFound()
  const context = lookup.context
  const locale = vipLocale(context)
  /* O endereço como foi aberto, e não o do nome atual: um nome corrigido no
     back-office não tira o cliente do âmbito da app que já instalou. */
  const base = `/pc/${params.token}`
  const trips = await loadVipTrips(context.vip.id)

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <PcBrandProvider brand={toClientBrand(context.brand)} cssVars={brandCssVars(context.brand)}>
        <ToastHost>
          {/* O botão do WhatsApp fica por cima da barra inferior, não atrás; e
              de 360 a 430 px nada desliza para o lado. */}
          <style>{`.fab{bottom:calc(84px + env(safe-area-inset-bottom))!important}body{overflow-x:clip}`}</style>
          {children}
          {/* A marca da empresa e o "Powered by WeeFly" (só nos parceiros). */}
          <PcFooter />
          <PcFab />
          <VipTabBar base={base} attention={trips.attention} />
        </ToastHost>
      </PcBrandProvider>
    </I18nProvider>
  )
}
