"use client"

import { Plane, Clock, TrendingDown, Sparkles, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import type {
  FlightTripType,
  FormattedFlightOffer,
  FormattedItinerary,
} from "@/types/flights"

const EMBER = "#FF4747"

type OfferVariant = "cheapest" | "best"

interface FlightOfferCardProps {
  offer: FormattedFlightOffer
  variant: OfferVariant
  tripType: FlightTripType
  onBook?: (offer: FormattedFlightOffer) => void
}

const VARIANT_META: Record<
  OfferVariant,
  { label: string; icon: typeof TrendingDown; badgeClass: string; highlight: boolean }
> = {
  cheapest: {
    label: "Mais barato",
    icon: TrendingDown,
    badgeClass: "bg-emerald-50 text-emerald-700",
    highlight: false,
  },
  best: {
    label: "Melhor opção",
    icon: Sparkles,
    badgeClass: "bg-[#FFECEC] text-[#FF4747]",
    highlight: true,
  },
}

export function FlightOfferCard({
  offer,
  variant,
  tripType,
  onBook,
}: FlightOfferCardProps) {
  const meta = VARIANT_META[variant]
  const Icon = meta.icon
  const legLabels =
    tripType === "round_trip" ? ["Ida", "Volta"] : ["Ida"]

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        meta.highlight ? "border-[#FF4747]/40 ring-1 ring-[#FF4747]/20" : "border-slate-200"
      )}
    >
      {/* Header: badge + price */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            meta.badgeClass
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
        <div className="text-right">
          <div className="text-2xl font-extrabold tracking-tight text-slate-900">
            {offer.price.label}
          </div>
          <div className="text-xs text-slate-400">preço total</div>
        </div>
      </div>

      {/* Itineraries */}
      <div className="mt-4 space-y-4">
        {offer.itineraries.map((itinerary, i) => (
          <ItineraryRow
            key={i}
            itinerary={itinerary}
            label={legLabels[i] ?? "Trecho"}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-xs text-slate-400">
          {offer.seatsLeft != null && offer.seatsLeft <= 5
            ? `Só ${offer.seatsLeft} lugares a este preço`
            : "Lugares disponíveis"}
        </span>
        <button
          type="button"
          onClick={() => onBook?.(offer)}
          style={{ backgroundColor: EMBER }}
          className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:brightness-95 active:scale-[0.98]"
        >
          Book Now
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function ItineraryRow({
  itinerary,
  label,
}: {
  itinerary: FormattedItinerary
  label: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <span className="text-slate-300">·</span>
        <span className="normal-case text-slate-500">
          {itinerary.departure.dateLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Departure */}
        <div className="w-14 shrink-0">
          <div className="text-lg font-bold text-slate-900 tabular-nums">
            {itinerary.departure.timeLabel}
          </div>
          <div className="text-xs font-medium text-slate-500">
            {itinerary.departure.iataCode}
          </div>
        </div>

        {/* Path */}
        <div className="flex flex-1 flex-col items-center px-1">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />
            {itinerary.durationLabel}
          </div>
          <div className="my-1 flex w-full items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="h-px flex-1 bg-slate-200" />
            <Plane className="h-3.5 w-3.5 -rotate-0 text-[#FF4747]" />
            <span className="h-px flex-1 bg-slate-200" />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          </div>
          <div
            className={cn(
              "text-[11px] font-medium",
              itinerary.stops === 0 ? "text-emerald-600" : "text-slate-400"
            )}
          >
            {itinerary.stopsLabel}
          </div>
        </div>

        {/* Arrival */}
        <div className="w-14 shrink-0 text-right">
          <div className="text-lg font-bold text-slate-900 tabular-nums">
            {itinerary.arrival.timeLabel}
          </div>
          <div className="text-xs font-medium text-slate-500">
            {itinerary.arrival.iataCode}
          </div>
        </div>
      </div>

      <div className="mt-1.5 text-xs text-slate-400">
        {itinerary.carrierName}
      </div>
    </div>
  )
}
