import { redirect } from "next/navigation"

import { RequestWizard } from "@/components/pc/request-wizard"
import { PcFab, PcFooter, ToastHost } from "@/components/pc/chrome"
import { CURRENCIES } from "@/lib/pc/catalog"
import { COUNTRY_BY_ISO, countryOfDial } from "@/lib/countries"
import { I18nProvider } from "@/i18n/provider"
import { getDictionary, getLocale } from "@/i18n/server"
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config"

/**
 * /pc — o pedido novo.
 *
 * Os parâmetros do link são os do construtor do back-office: `?lang=fr` fixa a
 * língua em que a equipa responde, `?currency=` a moeda da cotação, `?country=`
 * o país por omissão do telefone e `?agent=` quem partilhou. Nada disto é
 * visível ao cliente — ele só vê os campos já com os valores certos para o
 * mercado dele.
 *
 * `?cc=+33` é a versão antiga do mesmo parâmetro e continua a ser aceite: há
 * links partilhados no WhatsApp que ninguém vai reescrever. Um indicativo
 * partilhado (o +1) resolve para o primeiro país que o usa, e o cliente troca
 * se não for o dele.
 *
 * `?ref=` reabre um pedido: quem chega com um token vai direto ao seu caso, em
 * vez de encontrar um formulário vazio.
 */

export const dynamic = "force-dynamic"

export default function PriceCheckerPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const one = (key: string): string =>
    Array.isArray(searchParams[key])
      ? ((searchParams[key] as string[])[0] ?? "")
      : ((searchParams[key] as string | undefined) ?? "")

  const ref = one("ref").trim()
  if (ref) redirect(`/pc/${encodeURIComponent(ref)}`)

  /*
   * T-08 · aqui o `?lang=` é a única fonte, e é o que sempre foi.
   *
   * Não há caso e não há lead: quem abre este endereço ainda não nos disse nada.
   * O que existe é o parâmetro que o vendedor pôs no link (`?lang=fr`) e o
   * cookie de quem já andou pelo site — que é exactamente o que `getLocale`
   * responde. O que muda em relação a antes é que o formulário passa a ser
   * traduzido em vez de estar escrito em inglês literal.
   */
  const asked = one("lang").toLowerCase()
  const locale: Locale = isLocale(asked) ? asked : getLocale()

  const currency = one("currency").toUpperCase() || one("cur").toUpperCase()
  const agent = one("agent").trim()

  const askedCountry = one("country").trim().toUpperCase()
  const askedDial = one("cc").trim()
  /* Nulo quando o link não fixou país nenhum: nesse caso é o rascunho do
     cliente que manda, e não um palpite nosso. */
  const country =
    (COUNTRY_BY_ISO[askedCountry] ? askedCountry : null) ??
    countryOfDial(askedDial)

  return (
    <I18nProvider
      locale={locale}
      dictionary={getDictionary(locale)}
      fallback={locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)}
    >
      <ToastHost>
        <RequestWizard
          initialLang={locale}
          initialCurrency={CURRENCIES.includes(currency) ? currency : "EUR"}
          initialCountry={country}
          agentSlug={agent ? agent.slice(0, 40) : null}
        />
        <PcFooter />
        <PcFab />
      </ToastHost>
    </I18nProvider>
  )
}
