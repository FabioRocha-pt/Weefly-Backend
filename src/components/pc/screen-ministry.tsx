"use client"

import type { PcState } from "@/lib/pc/state"
import { useT } from "@/i18n/provider"
import { WaButton } from "@/components/pc/chrome"

/**
 * MIN-07 · aceitar a oferta garante a tarifa.
 *
 * Num caso de ministério não há pagamento do lado de quem pede: o ministério
 * paga à Alô fora da plataforma, e a bolsa já cobre a despesa. Este ecrã toma
 * o lugar do de pagamento e diz o que acontece a seguir — ou, se o saldo não
 * cobrir, di-lo com clareza (a Alô já foi avisada quando a opção foi aceite).
 */
export function ScreenMinistryPay({ state }: { state: PcState }) {
  const t = useT()
  const m = state.ministry!
  const insufficient = m.fundsCover === false

  return (
    <main className="shell view">
      <div className="card" style={{ padding: 22 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>
          {insufficient ? t("ministry.pay.insufficientTitle") : t("ministry.pay.title")}
        </h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
          {insufficient
            ? t("ministry.pay.insufficientBody", { partner: m.partnerName, ministry: m.name })
            : t("ministry.pay.body", { partner: m.partnerName, ministry: m.name })}
        </p>
        <div style={{ marginTop: 16 }}>
          <WaButton reference={state.request.reference}>{t("ministry.pay.help", { partner: m.partnerName })}</WaButton>
        </div>
      </div>
    </main>
  )
}
