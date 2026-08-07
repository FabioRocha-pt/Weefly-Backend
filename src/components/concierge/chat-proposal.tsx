"use client"

import { useTransition } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { selectOffer } from "@/actions/proposals"
import {
  type Offer,
  type PaxCounts,
  flightCodes,
  formatDuration,
  formatMoney,
  legMinutes,
  legsOf,
  offerTotal,
  stopsLabel,
  timeOf,
} from "@/lib/proposal-math"

export interface ProposalPayload {
  caseToken: string
  revision: number
  currency: string
  pax: PaxCounts
  offers: Offer[]
}

/**
 * As ofertas do agente, dentro da conversa.
 *
 * O conteúdo vem congelado no `payload` da mensagem em vez de ser lido da base
 * de dados — uma mensagem de chat é o registo do que foi dito naquele momento.
 * Se o agente publicar uma revisão, aparece uma mensagem nova por baixo; a
 * antiga fica como esteve, que é como qualquer conversa funciona.
 */
export function ChatProposal({ payload }: { payload: ProposalPayload }) {
  const [pending, startTransition] = useTransition()

  if (!payload?.offers?.length) return null

  return (
    <div className="space-y-2.5">
      {payload.revision > 1 && (
        <p className="text-[12px] font-semibold text-orange-600">
          Proposta atualizada (revisão {payload.revision})
        </p>
      )}

      {payload.offers.map((offer) => (
        <OfferBubble
          key={offer.id}
          offer={offer}
          payload={payload}
          pending={pending}
          onChoose={() =>
            startTransition(() => {
              selectOffer(payload.caseToken, offer.id)
            })
          }
        />
      ))}

      <p className="px-1 text-[11.5px] leading-relaxed text-slate-400">
        Ao escolher, segue para os dados dos passaportes. Pode voltar atrás e
        trocar de opção até ao pagamento.
      </p>
    </div>
  )
}

function OfferBubble({
  offer,
  payload,
  pending,
  onChoose,
}: {
  offer: Offer
  payload: ProposalPayload
  pending: boolean
  onChoose: () => void
}) {
  const legs = legsOf(offer)
  const badges = [
    offer.is_recommended && "Recomendada",
    offer.is_cheapest && "Mais barata",
    offer.is_fastest && "Mais rápida",
  ].filter(Boolean) as string[]

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-white",
        offer.is_recommended ? "border-orange-300" : "border-slate-200"
      )}
    >
      <div className="p-3.5">
        {badges.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {badges.map((b, i) => (
              <span
                key={b}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider",
                  i === 0
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                )}
              >
                {b}
              </span>
            ))}
          </div>
        )}

        <p className="text-[13.5px] font-bold leading-snug text-slate-900">
          {offer.name || "Opção"}
        </p>

        {(["ida", "volta"] as const).map((d) =>
          legs[d].length === 0 ? null : (
            <div
              key={d}
              className="mt-2 flex items-baseline gap-2 text-[12px] text-slate-600"
            >
              <span className="w-8 shrink-0 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">
                {d === "ida" ? "Ida" : "Volta"}
              </span>
              <span className="font-mono text-slate-900">
                {timeOf(legs[d][0].depart_at)} {legs[d][0].origin ?? "—"} →{" "}
                {timeOf(legs[d][legs[d].length - 1].arrive_at)}{" "}
                {legs[d][legs[d].length - 1].destination ?? "—"}
              </span>
              <span className="text-slate-400">
                {formatDuration(legMinutes(legs[d]))} · {stopsLabel(legs[d])}
              </span>
            </div>
          )
        )}

        <p className="mt-2 font-mono text-[10.5px] text-slate-400">
          {flightCodes([...legs.ida, ...legs.volta])}
          {offer.fare_name ? ` — ${offer.fare_name}` : ""}
        </p>

        {offer.agent_note && (
          <p className="mt-2.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] leading-relaxed text-slate-600">
            {offer.agent_note}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-dashed border-slate-200 px-3.5 py-3">
        <div>
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
            Total ·{" "}
            {payload.pax.adults + payload.pax.children + payload.pax.infants} pax
          </span>
          <span className="font-mono text-[17px] font-semibold tracking-tight text-slate-900">
            {formatMoney(offerTotal(offer, payload.pax), payload.currency)}
          </span>
        </div>
        <button
          type="button"
          onClick={onChoose}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-orange-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Escolher
        </button>
      </div>
    </article>
  )
}
