import { redirect } from "next/navigation"

import { RequestWizard } from "@/components/pc/request-wizard"
import { ToastHost, type PcLang } from "@/components/pc/chrome"
import { CCS, CURRENCIES } from "@/lib/pc/catalog"

/**
 * /pc — o pedido novo.
 *
 * Os parâmetros do link são os do construtor do back-office: `?lang=fr` fixa a
 * língua em que a equipa responde, `?currency=` a moeda da cotação, `?cc=` o
 * indicativo por omissão e `?agent=` quem partilhou. Nada disto é visível ao
 * cliente — ele só vê os campos já com os valores certos para o mercado dele.
 *
 * `?ref=` reabre um pedido: quem chega com um token vai direto ao seu caso, em
 * vez de encontrar um formulário vazio.
 */

export const dynamic = "force-dynamic"

const LANGS: PcLang[] = ["EN", "PT", "FR"]

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

  const lang = one("lang").toUpperCase() as PcLang
  const currency = one("currency").toUpperCase() || one("cur").toUpperCase()
  const cc = one("cc").trim()
  const agent = one("agent").trim()

  return (
    <ToastHost>
      <RequestWizard
        initialLang={LANGS.includes(lang) ? lang : "EN"}
        initialCurrency={CURRENCIES.includes(currency) ? currency : "EUR"}
        initialDialCode={CCS.some((c) => c.c === cc) ? cc : "+238"}
        agentSlug={agent ? agent.slice(0, 40) : null}
      />
    </ToastHost>
  )
}
