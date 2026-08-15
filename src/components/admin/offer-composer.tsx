"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  addOffer,
  duplicateOffer,
  publishProposal,
  removeOffer,
  reorderOffers,
  saveOffer,
  saveProposalMeta,
  startRevision,
  type OfferDraft,
  type SegmentDraft,
} from "@/actions/proposals"
import {
  type AdminOffer,
  type Cabin,
  type Offer,
  type OfferDirection,
  type OfferSegment,
  type PaxCounts,
  type Proposal,
  flightCodes,
  formatAmountPlain,
  formatDuration,
  formatMoney,
  layoverMinutes,
  legMinutes,
  legsOf,
  blockerText,
  offerBlockers,
  offerTotal,
  parseMoney,
  segmentMinutes,
  stopsLabel,
  timeOf,
} from "@/lib/proposal-math"
import { useT } from "@/i18n/provider"
import type { Translator } from "@/i18n/translate"

const CURRENCIES = ["CVE", "EUR", "USD"]

/** A ordem em que as cabinas aparecem no seletor de cada trecho. */
const CABINS: Cabin[] = ["economy", "premium_economy", "business", "first"]

// --- Estado local ------------------------------------------------------------
// Os montantes vivem como texto enquanto se escreve: "1 84" não é um número mas
// é um estado legítimo de um campo a meio de ser preenchido. A conversão para
// unidades menores acontece no cálculo e ao gravar, nunca a cada tecla.

interface SegmentState {
  key: string
  direction: OfferDirection
  carrier_code: string
  flight_number: string
  equipment: string
  booking_class: string
  cabin: Cabin
  origin: string
  destination: string
  depart_at: string
  arrive_at: string
  terminal_from: string
  terminal_to: string
}

interface OfferState {
  id: string
  name: string
  is_recommended: boolean
  is_cheapest: boolean
  is_fastest: boolean
  fare_name: string
  baggage_cabin: string
  baggage_hold: string
  change_policy: string
  refund_policy: string
  seat_policy: string
  documents: string
  price_adult: string
  price_child: string
  price_infant: string
  taxes_total: string
  service_fee: string
  lock_fee: string
  lock_fee_enabled: boolean
  cost_total: string
  valid_until: string
  agent_note: string
  segments: SegmentState[]
}

/** `datetime-local` só aceita "YYYY-MM-DDTHH:mm"; a base devolve os segundos. */
function localMoment(value: string | null): string {
  return value ? value.slice(0, 16) : ""
}

let keySeed = 0
function nextKey(): string {
  return `s${keySeed++}`
}

function fromAdminOffer(offer: AdminOffer): OfferState {
  return {
    id: offer.id,
    name: offer.name ?? "",
    is_recommended: offer.is_recommended,
    is_cheapest: offer.is_cheapest,
    is_fastest: offer.is_fastest,
    fare_name: offer.fare_name ?? "",
    baggage_cabin: offer.baggage_cabin ?? "",
    baggage_hold: offer.baggage_hold ?? "",
    change_policy: offer.change_policy ?? "",
    refund_policy: offer.refund_policy ?? "",
    seat_policy: offer.seat_policy ?? "",
    documents: offer.documents ?? "",
    price_adult: formatAmountPlain(offer.price_adult),
    price_child: formatAmountPlain(offer.price_child),
    price_infant: formatAmountPlain(offer.price_infant),
    taxes_total: formatAmountPlain(offer.taxes_total),
    service_fee: formatAmountPlain(offer.service_fee),
    lock_fee: formatAmountPlain(offer.lock_fee),
    lock_fee_enabled: offer.lock_fee_enabled,
    cost_total: formatAmountPlain(offer.cost_total),
    valid_until: localMoment(offer.valid_until),
    agent_note: offer.agent_note ?? "",
    segments: [...offer.segments]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        key: nextKey(),
        direction: s.direction,
        carrier_code: s.carrier_code ?? "",
        flight_number: s.flight_number ?? "",
        equipment: s.equipment ?? "",
        booking_class: s.booking_class ?? "",
        cabin: s.cabin,
        origin: s.origin ?? "",
        destination: s.destination ?? "",
        depart_at: localMoment(s.depart_at),
        arrive_at: localMoment(s.arrive_at),
        terminal_from: s.terminal_from ?? "",
        terminal_to: s.terminal_to ?? "",
      })),
  }
}

function draftOf(state: OfferState): OfferDraft {
  return {
    name: state.name,
    is_recommended: state.is_recommended,
    is_cheapest: state.is_cheapest,
    is_fastest: state.is_fastest,
    fare_name: state.fare_name,
    baggage_cabin: state.baggage_cabin,
    baggage_hold: state.baggage_hold,
    change_policy: state.change_policy,
    refund_policy: state.refund_policy,
    seat_policy: state.seat_policy,
    documents: state.documents,
    price_adult: parseMoney(state.price_adult),
    price_child: parseMoney(state.price_child),
    price_infant: parseMoney(state.price_infant),
    taxes_total: parseMoney(state.taxes_total),
    service_fee: parseMoney(state.service_fee),
    lock_fee: parseMoney(state.lock_fee),
    lock_fee_enabled: state.lock_fee_enabled,
    cost_total: parseMoney(state.cost_total),
    valid_until: state.valid_until,
    agent_note: state.agent_note,
    segments: state.segments.map(
      ({ key: _key, ...rest }): SegmentDraft => rest
    ),
  }
}

/** A forma que as funções de cálculo e a pré-visualização esperam. */
function asOffer(state: OfferState, position: number): Offer {
  return {
    id: state.id,
    position,
    name: state.name,
    include_in_proposal: true,
    is_recommended: state.is_recommended,
    is_cheapest: state.is_cheapest,
    is_fastest: state.is_fastest,
    fare_name: state.fare_name || null,
    baggage_cabin: state.baggage_cabin || null,
    baggage_hold: state.baggage_hold || null,
    change_policy: state.change_policy || null,
    refund_policy: state.refund_policy || null,
    seat_policy: state.seat_policy || null,
    documents: state.documents || null,
    price_adult: parseMoney(state.price_adult),
    price_child: parseMoney(state.price_child),
    price_infant: parseMoney(state.price_infant),
    taxes_total: parseMoney(state.taxes_total),
    service_fee: parseMoney(state.service_fee),
    lock_fee: parseMoney(state.lock_fee),
    lock_fee_enabled: state.lock_fee_enabled,
    valid_until: state.valid_until || null,
    agent_note: state.agent_note || null,
    segments: state.segments.map(
      (s, i): OfferSegment => ({
        id: s.key,
        position: i,
        direction: s.direction,
        carrier_code: s.carrier_code || null,
        flight_number: s.flight_number || null,
        equipment: s.equipment || null,
        booking_class: s.booking_class || null,
        cabin: s.cabin,
        origin: s.origin || null,
        destination: s.destination || null,
        depart_at: s.depart_at || null,
        arrive_at: s.arrive_at || null,
        terminal_from: s.terminal_from || null,
        terminal_to: s.terminal_to || null,
      })
    ),
  }
}

function emptySegment(direction: OfferDirection): SegmentState {
  return {
    key: nextKey(),
    direction,
    carrier_code: "",
    flight_number: "",
    equipment: "",
    booking_class: "",
    cabin: "economy",
    origin: "",
    destination: "",
    depart_at: "",
    arrive_at: "",
    terminal_from: "",
    terminal_to: "",
  }
}

// --- Compositor --------------------------------------------------------------

export function OfferComposer({
  caseId,
  token,
  proposal,
  offers: serverOffers,
  pax,
  brief,
}: {
  caseId: string
  token: string
  proposal: Proposal
  offers: AdminOffer[]
  pax: PaxCounts
  /** A coluna do pedido do cliente, renderizada no servidor. */
  brief: React.ReactNode
}) {
  const t = useT()
  const router = useRouter()
  const published = proposal.status === "publicada"

  const [offers, setOffers] = useState<OfferState[]>(() =>
    serverOffers.map(fromAdminOffer)
  )
  const [openId, setOpenId] = useState<string | null>(
    () => serverOffers[0]?.id ?? null
  )
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const snapshots = useRef<Record<string, string>>(
    Object.fromEntries(
      serverOffers.map((o) => [o.id, JSON.stringify(draftOf(fromAdminOffer(o)))])
    )
  )

  /*
   * O servidor manda a lista de ofertas em cada render. Quando o conjunto de
   * ids muda — alguém adicionou, duplicou ou removeu — o estado local é
   * substituído. Quando os ids são os mesmos, o local é que está mais fresco
   * (é onde o vendedor está a escrever) e fica.
   */
  useEffect(() => {
    const incoming = serverOffers.map(fromAdminOffer)
    const sameSet =
      incoming.length === offers.length &&
      incoming.every((o, i) => o.id === offers[i]?.id)
    if (sameSet) return

    const appeared = incoming.find((o) => !offers.some((x) => x.id === o.id))
    setOffers(incoming)
    snapshots.current = Object.fromEntries(
      incoming.map((o) => [o.id, JSON.stringify(draftOf(o))])
    )
    if (appeared) setOpenId(appeared.id)
    else if (!incoming.some((o) => o.id === openId)) {
      setOpenId(incoming[0]?.id ?? null)
    }
    // `offers` e `openId` são deliberadamente omitidos: este efeito reage a
    // mudanças vindas do servidor, não às edições locais que ele próprio causa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverOffers])

  const open = offers.find((o) => o.id === openId) ?? null

  /* Gravação automática da oferta aberta. 900 ms depois da última tecla: tempo
     suficiente para não gravar a meio de uma palavra, curto o bastante para
     ninguém sair da página a pensar que perdeu o que escreveu. */
  useEffect(() => {
    if (published || !open) return
    const serial = JSON.stringify(draftOf(open))
    if (snapshots.current[open.id] === serial) return

    const timer = setTimeout(() => {
      setSaveState("saving")
      startTransition(async () => {
        const result = await saveOffer(caseId, open.id, draftOf(open))
        if (result.error) {
          setSaveState("error")
          setError(result.error)
          return
        }
        snapshots.current[open.id] = serial
        setSaveState("saved")
        setError(null)
      })
    }, 900)

    return () => clearTimeout(timer)
  }, [open, caseId, published])

  function patch(id: string, changes: Partial<OfferState>) {
    setOffers((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...changes } : o))
    )
  }

  function patchSegment(
    offerId: string,
    key: string,
    changes: Partial<SegmentState>
  ) {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? {
              ...o,
              segments: o.segments.map((s) =>
                s.key === key ? { ...s, ...changes } : s
              ),
            }
          : o
      )
    )
  }

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function move(id: string, delta: number) {
    const from = offers.findIndex((o) => o.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= offers.length) return
    const next = [...offers]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOffers(next)
    run(() => reorderOffers(caseId, next.map((o) => o.id)))
  }

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[262px_minmax(0,1fr)_350px]">
      {brief}

      {/* ═══ centro · compositor ═══ */}
      <main className="flex min-w-0 flex-col gap-3.5">
        {published && (
          <div className="rounded-xl border border-adm-ok/30 bg-adm-ok/10 p-4 text-[12.5px] leading-relaxed text-adm-ok">
            {t("admin.composerLocked", { revision: proposal.revision })}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-adm-ember/40 bg-adm-ember/10 p-4 text-[12.5px] leading-relaxed text-adm-ember">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {offers.length === 0 && (
          <div className="rounded-xl border border-adm-line bg-adm-panel p-8 text-center">
            <p className="text-[13px] text-adm-muted">
              {t("admin.composerEmpty")}
            </p>
          </div>
        )}

        {offers.map((offer, index) =>
          offer.id === openId ? (
            <OpenOffer
              key={offer.id}
              offer={offer}
              index={index}
              pax={pax}
              currency={proposal.currency}
              disabled={published || pending}
              locked={published}
              onPatch={(changes) => patch(offer.id, changes)}
              onPatchSegment={(key, changes) =>
                patchSegment(offer.id, key, changes)
              }
              onDuplicate={() => run(() => duplicateOffer(caseId, offer.id))}
              onRemove={() => run(() => removeOffer(caseId, offer.id))}
              onCollapse={() => setOpenId(null)}
              t={t}
            />
          ) : (
            <CollapsedOffer
              key={offer.id}
              offer={offer}
              index={index}
              total={offers.length}
              pax={pax}
              currency={proposal.currency}
              disabled={published || pending}
              onOpen={() => setOpenId(offer.id)}
              onMove={(delta) => move(offer.id, delta)}
              t={t}
            />
          )
        )}

        {!published && (
          <button
            type="button"
            onClick={() => run(() => addOffer(caseId))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-adm-line p-3.5 text-[13px] font-bold text-adm-muted transition-colors hover:border-[#46587A] hover:text-adm-txt-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t("admin.composerNewOffer")}
            <span className="font-normal text-adm-muted">
              {t("admin.composerNewOfferHint")}
            </span>
          </button>
        )}
      </main>

      {/* ═══ direita · pré-visualização e publicação ═══ */}
      <aside className="flex flex-col gap-[18px] xl:sticky xl:top-[18px]">
        <ClientPreview
          offer={open ? asOffer(open, 0) : null}
          pax={pax}
          currency={proposal.currency}
          token={token}
          published={published}
          t={t}
        />
        <PublishPanel
          caseId={caseId}
          token={token}
          proposal={proposal}
          offers={offers}
          serverOffers={serverOffers}
          pax={pax}
          pending={pending}
          saveState={saveState}
          onError={setError}
          onDone={() => router.refresh()}
          onRevision={() => run(() => startRevision(caseId))}
          t={t}
        />
      </aside>
    </div>
  )
}

// --- Oferta aberta -----------------------------------------------------------

function OpenOffer({
  offer,
  index,
  pax,
  currency,
  disabled,
  locked,
  onPatch,
  onPatchSegment,
  onDuplicate,
  onRemove,
  onCollapse,
  t,
}: {
  offer: OfferState
  index: number
  pax: PaxCounts
  currency: string
  disabled: boolean
  locked: boolean
  onPatch: (changes: Partial<OfferState>) => void
  onPatchSegment: (key: string, changes: Partial<SegmentState>) => void
  onDuplicate: () => void
  onRemove: () => void
  onCollapse: () => void
  t: Translator
}) {
  const [leg, setLeg] = useState<OfferDirection>("ida")
  const preview = asOffer(offer, index)
  const legs = legsOf(preview)
  const segments = offer.segments.filter((s) => s.direction === leg)

  const total = offerTotal(preview, pax)
  const cost = parseMoney(offer.cost_total)
  const margin = total - cost
  const marginPct = total > 0 ? ((margin / total) * 100).toFixed(1) : "0,0"

  function addSegment() {
    onPatch({ segments: [...offer.segments, emptySegment(leg)] })
  }

  function removeSegment(key: string) {
    onPatch({ segments: offer.segments.filter((s) => s.key !== key) })
  }

  return (
    <article className="rounded-xl border border-[#46587A] bg-adm-panel shadow-[0_0_0_1px_rgba(70,88,122,.5)]">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-adm-line-soft p-3.5">
        <input
          value={offer.name}
          disabled={disabled}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder={t("admin.composerOfferName")}
          className="min-w-[210px] flex-1 rounded-lg border border-adm-line bg-adm-panel-2 px-2.5 py-1.5 text-sm font-bold text-adm-txt outline-none transition-colors placeholder:font-normal placeholder:text-adm-muted focus:border-[#46587A] disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Flag
            label={t("admin.composerFlagRecommended")}
            on={offer.is_recommended}
            tone="ok"
            disabled={disabled}
            onClick={() => onPatch({ is_recommended: !offer.is_recommended })}
          />
          <Flag
            label={t("admin.composerFlagCheapest")}
            on={offer.is_cheapest}
            disabled={disabled}
            onClick={() => onPatch({ is_cheapest: !offer.is_cheapest })}
          />
          <Flag
            label={t("admin.composerFlagFastest")}
            on={offer.is_fastest}
            disabled={disabled}
            onClick={() => onPatch({ is_fastest: !offer.is_fastest })}
          />
          <IconButton
            title={t("admin.composerDuplicate")}
            onClick={onDuplicate}
            disabled={disabled}
          >
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            title={t("admin.composerRemove")}
            onClick={onRemove}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title={t("admin.composerCollapse")} onClick={onCollapse}>
            <ChevronUp className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </header>

      <fieldset disabled={disabled} className="space-y-5 p-3.5 disabled:opacity-70">
        {/* itinerário */}
        <Section
          title={t("admin.composerItinerary")}
          aside={t("admin.composerLegsSummary", {
            out: t("admin.composerSegments", { count: legs.ida.length }),
            back: t("admin.composerSegments", { count: legs.volta.length }),
          })}
        >
          <div className="mb-3 flex gap-1.5">
            {(["ida", "volta"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setLeg(d)}
                aria-selected={leg === d}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors",
                  leg === d
                    ? "border-[#46587A] bg-adm-raise text-adm-txt"
                    : "border-adm-line bg-adm-panel-2 text-adm-muted hover:text-adm-txt-2"
                )}
              >
                {t(d === "ida" ? "legs.outbound" : "legs.inbound")}
              </button>
            ))}
          </div>

          {segments.length === 0 && (
            <p className="mb-2.5 rounded-lg bg-adm-panel-2 p-3 text-[12.5px] text-adm-muted">
              {t(
                leg === "ida"
                  ? "admin.composerNoOutbound"
                  : "admin.composerNoInbound"
              )}
            </p>
          )}

          {segments.map((segment, i) => {
            const previewSegments = legs[leg]
            const duration = previewSegments[i]
              ? segmentMinutes(previewSegments[i])
              : null
            const wait =
              i > 0 && previewSegments[i - 1] && previewSegments[i]
                ? layoverMinutes(previewSegments[i - 1], previewSegments[i])
                : null

            return (
              <div
                key={segment.key}
                className="mb-2.5 rounded-[10px] border border-adm-line bg-adm-panel-2 p-3"
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-adm-raise text-[10px] font-extrabold text-adm-txt-2">
                    {i + 1}
                  </span>
                  <span className="text-xs font-bold text-adm-txt-2">
                    {segment.origin || "—"} → {segment.destination || "—"}
                  </span>
                  <IconButton
                    title={t("admin.composerRemoveSegment")}
                    onClick={() => removeSegment(segment.key)}
                    className="ml-auto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </div>

                <div className="grid grid-cols-12 gap-2.5">
                  <Field label={t("admin.composerCarrier")} span={2}>
                    <Input
                      mono
                      maxLength={3}
                      value={segment.carrier_code}
                      onChange={(v) =>
                        onPatchSegment(segment.key, {
                          carrier_code: v.toUpperCase(),
                        })
                      }
                      placeholder="VR"
                    />
                  </Field>
                  <Field label={t("admin.composerFlightNo")} span={2}>
                    <Input
                      mono
                      maxLength={6}
                      value={segment.flight_number}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { flight_number: v })
                      }
                      placeholder="231"
                    />
                  </Field>
                  <Field label={t("admin.composerEquipment")} span={4}>
                    <Input
                      value={segment.equipment}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { equipment: v })
                      }
                      placeholder="Airbus A320neo"
                    />
                  </Field>
                  <Field label={t("admin.composerBookingClass")} span={2}>
                    <Input
                      mono
                      maxLength={2}
                      value={segment.booking_class}
                      onChange={(v) =>
                        onPatchSegment(segment.key, {
                          booking_class: v.toUpperCase(),
                        })
                      }
                      placeholder="T"
                    />
                  </Field>
                  <Field label={t("admin.composerCabin")} span={2}>
                    <select
                      value={segment.cabin}
                      onChange={(e) =>
                        onPatchSegment(segment.key, {
                          cabin: e.target.value as Cabin,
                        })
                      }
                      className={inputClass}
                    >
                      {CABINS.map((c) => (
                        <option key={c} value={c}>
                          {t("cabins." + c)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label={t("admin.composerOrigin")} span={3}>
                    <Input
                      mono
                      maxLength={3}
                      value={segment.origin}
                      onChange={(v) =>
                        onPatchSegment(segment.key, {
                          origin: v.toUpperCase(),
                        })
                      }
                      placeholder="RAI"
                    />
                  </Field>
                  <Field label={t("admin.composerDeparture")} span={3}>
                    <Input
                      type="datetime-local"
                      value={segment.depart_at}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { depart_at: v })
                      }
                    />
                  </Field>
                  <Field label={t("admin.composerDestination")} span={3}>
                    <Input
                      mono
                      maxLength={3}
                      value={segment.destination}
                      onChange={(v) =>
                        onPatchSegment(segment.key, {
                          destination: v.toUpperCase(),
                        })
                      }
                      placeholder="SID"
                    />
                  </Field>
                  <Field label={t("admin.composerArrival")} span={3}>
                    <Input
                      type="datetime-local"
                      value={segment.arrive_at}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { arrive_at: v })
                      }
                    />
                  </Field>

                  <Field label={t("admin.composerTerminalFrom")} span={6}>
                    <Input
                      value={segment.terminal_from}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { terminal_from: v })
                      }
                      placeholder="1"
                    />
                  </Field>
                  <Field label={t("admin.composerTerminalTo")} span={6}>
                    <Input
                      value={segment.terminal_to}
                      onChange={(v) =>
                        onPatchSegment(segment.key, { terminal_to: v })
                      }
                      placeholder={t("admin.phTerminal")}
                    />
                  </Field>

                  <div className="col-span-12">
                    <div className="flex flex-wrap gap-4 rounded-lg bg-adm-muted/[.14] px-2.5 py-2 text-xs text-adm-txt-2">
                      <span>
                        {t("admin.composerDuration")}{" "}
                        <b className="font-mono font-semibold text-adm-txt">
                          {formatDuration(duration)}
                        </b>
                      </span>
                      {wait !== null && (
                        <span>
                          {t("admin.composerLayoverAt", {
                            place: segment.origin || "—",
                          })}{" "}
                          <b className="font-mono font-semibold text-adm-txt">
                            {formatDuration(wait)}
                          </b>
                        </span>
                      )}
                      {i === previewSegments.length - 1 && (
                        <span>
                          {t(
                            leg === "ida"
                              ? "admin.composerLegTotalOut"
                              : "admin.composerLegTotalBack"
                          )}{" "}
                          <b className="font-mono font-semibold text-adm-txt">
                            {formatDuration(legMinutes(previewSegments))}
                          </b>
                        </span>
                      )}
                      <span className="text-adm-muted">
                        {t("admin.composerComputed")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <button
            type="button"
            onClick={addSegment}
            className="w-full rounded-[9px] border border-dashed border-adm-line py-2.5 text-xs font-bold text-adm-muted transition-colors hover:border-[#46587A] hover:text-adm-txt-2"
          >
            {t(
              leg === "ida"
                ? "admin.composerAddSegmentOut"
                : "admin.composerAddSegmentBack"
            )}
          </button>
        </Section>

        {/* condições */}
        <Section title={t("admin.composerConditions")}>
          <div className="grid grid-cols-12 gap-2.5">
            <Field label={t("admin.composerFareName")} span={4}>
              <Input
                value={offer.fare_name}
                onChange={(v) => onPatch({ fare_name: v })}
                placeholder="Economy Smart"
              />
            </Field>
            <Field label={t("admin.composerBaggageCabin")} span={4}>
              <Input
                value={offer.baggage_cabin}
                onChange={(v) => onPatch({ baggage_cabin: v })}
                placeholder={t("admin.phBaggageCabin")}
              />
            </Field>
            <Field label={t("admin.composerBaggageHold")} span={4}>
              <Input
                value={offer.baggage_hold}
                onChange={(v) => onPatch({ baggage_hold: v })}
                placeholder={t("admin.phBaggageHold")}
              />
            </Field>
            <Field label={t("admin.composerChange")} span={4}>
              <Input
                value={offer.change_policy}
                onChange={(v) => onPatch({ change_policy: v })}
                placeholder={t("admin.phChange")}
              />
            </Field>
            <Field label={t("admin.composerRefund")} span={4}>
              <Input
                value={offer.refund_policy}
                onChange={(v) => onPatch({ refund_policy: v })}
                placeholder={t("admin.phRefund")}
              />
            </Field>
            <Field label={t("admin.composerSeat")} span={4}>
              <Input
                value={offer.seat_policy}
                onChange={(v) => onPatch({ seat_policy: v })}
                placeholder={t("admin.phSeat")}
              />
            </Field>
            <Field label={t("admin.composerDocuments")} span={12}>
              <Input
                value={offer.documents}
                onChange={(v) => onPatch({ documents: v })}
                placeholder={t("admin.phDocuments")}
              />
            </Field>
          </div>
        </Section>

        {/* preço */}
        <Section
          title={t("admin.composerPrice")}
          aside={
            <>
              {t("admin.composerUnitValues")}{" "}
              <b className="font-mono font-semibold text-adm-txt-2">
                {currency}
              </b>
            </>
          }
        >
          <div className="overflow-hidden rounded-[10px] border border-adm-line bg-adm-panel-2">
            <PriceRow
              label={t("admin.composerRowAdult")}
              hint={t("admin.composerRowAdultNote")}
              qty={`× ${pax.adults}`}
              value={offer.price_adult}
              onChange={(v) => onPatch({ price_adult: v })}
            />
            {pax.children > 0 && (
              <PriceRow
                label={t("admin.composerRowChild")}
                hint={t("admin.composerRowChildNote")}
                qty={`× ${pax.children}`}
                value={offer.price_child}
                onChange={(v) => onPatch({ price_child: v })}
              />
            )}
            {pax.infants > 0 && (
              <PriceRow
                label={t("admin.composerRowInfant")}
                hint={t("admin.composerRowInfantNote")}
                qty={`× ${pax.infants}`}
                value={offer.price_infant}
                onChange={(v) => onPatch({ price_infant: v })}
              />
            )}
            <PriceRow
              label={t("admin.composerRowTaxes")}
              hint={t("admin.composerRowTaxesNote", {
                count: pax.adults + pax.children + pax.infants,
              })}
              qty="total"
              value={offer.taxes_total}
              onChange={(v) => onPatch({ taxes_total: v })}
            />
            <PriceRow
              label={t("admin.composerRowService")}
              hint={t("admin.composerRowServiceNote")}
              qty="total"
              value={offer.service_fee}
              onChange={(v) => onPatch({ service_fee: v })}
              tone="fee"
            />
            <div className="grid grid-cols-[1fr_96px_128px] items-center gap-2.5 border-b border-adm-line-soft px-3 py-2.5">
              <div>
                <label className="flex items-center gap-2 text-xs text-adm-muted">
                  <input
                    type="checkbox"
                    checked={offer.lock_fee_enabled}
                    onChange={(e) =>
                      onPatch({ lock_fee_enabled: e.target.checked })
                    }
                    className="h-[15px] w-[15px] accent-adm-ember"
                  />
                  {t("admin.composerRowLock")}
                </label>
                <small className="mt-0.5 block text-[11px] text-adm-muted">
                  {t("admin.composerRowLockNote")}
                </small>
              </div>
              <div className="text-center font-mono text-xs text-adm-muted">
                {t("admin.composerTotalUnit")}
              </div>
              <MoneyInput
                value={offer.lock_fee}
                disabled={!offer.lock_fee_enabled}
                onChange={(v) => onPatch({ lock_fee: v })}
              />
            </div>
            <div className="grid grid-cols-[1fr_96px_128px] items-center gap-2.5 border-t border-adm-line bg-adm-raise px-3 py-2.5">
              <div className="text-sm font-extrabold text-adm-txt">
                {t("admin.composerTotal")}
              </div>
              <div className="text-center font-mono text-xs text-adm-muted">
                {currency}
              </div>
              <div className="text-right font-mono text-[19px] font-semibold text-adm-txt">
                {formatMoney(total, currency)}
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-12 gap-2.5">
            <Field
              label={t("admin.composerCost")}
              span={4}
              hint={t("admin.composerCostNote")}
            >
              <MoneyInput
                value={offer.cost_total}
                onChange={(v) => onPatch({ cost_total: v })}
              />
            </Field>
            <Field label={t("admin.composerMargin")} span={4}>
              <div className="rounded-lg bg-adm-muted/[.14] px-2.5 py-2 text-xs">
                <b
                  className={cn(
                    "font-mono font-semibold",
                    margin <= 0 ? "text-adm-ember" : "text-adm-ok"
                  )}
                >
                  {formatMoney(margin, currency)} · {marginPct}%
                </b>
              </div>
            </Field>
            <Field
              label={t("admin.composerValidUntil")}
              span={4}
              hint={t("admin.composerValidUntilNote")}
            >
              <Input
                type="datetime-local"
                value={offer.valid_until}
                onChange={(v) => onPatch({ valid_until: v })}
              />
            </Field>
          </div>
        </Section>

        {/* nota */}
        <Section
          title={t("admin.composerNote")}
          aside={t("admin.composerNoteHint")}
        >
          <textarea
            value={offer.agent_note}
            onChange={(e) => onPatch({ agent_note: e.target.value })}
            placeholder={t("admin.composerNotePlaceholder")}
            className={cn(inputClass, "min-h-[74px] resize-y leading-relaxed")}
          />
        </Section>

        {locked && (
          <p className="text-[11.5px] text-adm-muted">
            {t("admin.composerLockedFields")}
          </p>
        )}
      </fieldset>
    </article>
  )
}

// --- Oferta fechada ----------------------------------------------------------

function CollapsedOffer({
  offer,
  index,
  total,
  pax,
  currency,
  disabled,
  onOpen,
  onMove,
  t,
}: {
  offer: OfferState
  index: number
  total: number
  pax: PaxCounts
  currency: string
  disabled: boolean
  onOpen: () => void
  onMove: (delta: number) => void
  t: Translator
}) {
  const preview = asOffer(offer, index)
  const { ida } = legsOf(preview)
  const badges = [
    offer.is_recommended && t("admin.composerFlagRecommended"),
    offer.is_cheapest && t("admin.composerFlagCheapest"),
    offer.is_fastest && t("admin.composerFlagFastest"),
  ].filter(Boolean) as string[]

  const summary =
    ida.length > 0
      ? `${ida[0].origin ?? "—"} ${timeOf(ida[0].depart_at)} → ${ida[ida.length - 1].destination ?? "—"} ${timeOf(ida[ida.length - 1].arrive_at)} · ${formatDuration(legMinutes(ida))} · ${stopsLabel(ida)}`
      : t("admin.composerNoItinerary")

  return (
    <div className="flex items-center gap-3 rounded-xl border border-adm-line bg-adm-panel px-3.5 py-3 transition-colors hover:border-[#41506A]">
      <div className="flex shrink-0 flex-col">
        <IconButton
          title={t("admin.composerUp")}
          onClick={() => onMove(-1)}
          disabled={disabled || index === 0}
          className="!p-1"
        >
          <ChevronUp className="h-3 w-3" />
        </IconButton>
        <IconButton
          title={t("admin.composerDown")}
          onClick={() => onMove(1)}
          disabled={disabled || index === total - 1}
          className="!p-1"
        >
          <ChevronDown className="h-3 w-3" />
        </IconButton>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-sm font-bold text-adm-txt">
          {offer.name || t("admin.composerUnnamed")}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-adm-muted">
          {summary}
        </div>
      </button>
      {badges.map((b) => (
        <span
          key={b}
          className="hidden shrink-0 rounded-md border border-adm-line bg-adm-muted/[.14] px-2 py-1 text-[11px] font-bold text-adm-txt-2 sm:inline"
        >
          {b}
        </span>
      ))}
      <div className="shrink-0 whitespace-nowrap font-mono text-base font-semibold text-adm-txt">
        {formatMoney(offerTotal(preview, pax), currency)}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-[9px] border border-adm-line bg-adm-panel-2 px-2.5 py-1.5 text-xs font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
      >
        {t("admin.composerOpen")}
      </button>
    </div>
  )
}

// --- Pré-visualização --------------------------------------------------------

/**
 * O cartão exatamente como o cliente o vai receber, atualizado enquanto se
 * escreve. É a única defesa contra publicar um itinerário que faz sentido para
 * quem o escreveu e nenhum para quem o lê.
 */
function ClientPreview({
  offer,
  pax,
  currency,
  token,
  published,
  t,
}: {
  offer: Offer | null
  pax: PaxCounts
  currency: string
  token: string
  published: boolean
  t: Translator
}) {
  const legs = offer ? legsOf(offer) : { ida: [], volta: [] }
  const badges = offer
    ? ([
        offer.is_recommended && t("proposal.badgeRecommended"),
        offer.is_cheapest && t("proposal.badgeCheapest"),
        offer.is_fastest && t("proposal.badgeFastest"),
      ].filter(Boolean) as string[])
    : []

  return (
    <section className="rounded-xl border border-adm-line bg-adm-panel">
      <header className="flex items-center gap-2.5 border-b border-adm-line-soft p-3.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {t("admin.previewTitle")}
        </h2>
        {published && (
          <a
            href={`/p/${token}/proposta`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-[9px] border border-adm-line bg-adm-panel-2 px-2.5 py-1.5 text-xs font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
          >
            {t("admin.previewOpenLink")}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>
      <div className="p-3.5">
        <p className="mb-2.5 text-[11px] text-adm-muted">
          {t("admin.previewLive")}
        </p>
        <div className="rounded-[10px] bg-slate-100 p-3 text-[#12161F]">
          {!offer ? (
            <p className="py-6 text-center text-xs text-slate-500">
              {t("admin.previewEmpty")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-[11px] border border-[#DFE5EC] bg-white">
              <div className="px-3.5 py-3">
                {badges.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {badges.map((b, i) => (
                      <span
                        key={b}
                        className={cn(
                          "rounded-[5px] px-1.5 py-1 text-[9px] font-extrabold uppercase tracking-[.08em]",
                          i === 0
                            ? "bg-[#1E2532] text-white"
                            : "bg-slate-100 text-[#3A4557]"
                        )}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
                {(["ida", "volta"] as const).map((d) =>
                  legs[d].length === 0 ? null : (
                    <PreviewLeg
                      key={d}
                      label={t(d === "ida" ? "legs.outbound" : "legs.inbound")}
                      segments={legs[d]}
                    />
                  )
                )}
                <p className="mt-1.5 font-mono text-[10px] text-[#64748B]">
                  {flightCodes([...legs.ida, ...legs.volta]) || "—"}
                  {offer.fare_name ? ` — ${offer.fare_name}` : ""}
                </p>
                {offer.agent_note && (
                  <p className="mt-2.5 rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] leading-relaxed text-[#3A4557]">
                    {offer.agent_note}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2.5 border-t border-dashed border-[#DFE5EC] px-3.5 py-3">
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-[.08em] text-[#64748B]">
                    {t("proposal.totalFor", {
                      count: pax.adults + pax.children + pax.infants,
                    })}
                  </span>
                  <span className="font-mono text-xl font-semibold leading-tight tracking-tight">
                    {formatMoney(offerTotal(offer, pax), currency)}
                  </span>
                </div>
                <span className="ml-auto rounded-lg bg-[#EE5128] px-3 py-2.5 text-[11.5px] font-bold text-white">
                  {t("admin.previewChoose")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function PreviewLeg({
  label,
  segments,
}: {
  label: string
  segments: OfferSegment[]
}) {
  const first = segments[0]
  const last = segments[segments.length - 1]
  return (
    <div className="flex items-center gap-2.5 border-t border-dashed border-[#DFE5EC] py-2 first:border-t-0">
      <span className="w-[34px] shrink-0 text-[9px] font-extrabold uppercase tracking-[.07em] text-[#64748B]">
        {label}
      </span>
      <div>
        <span className="block font-mono text-sm font-semibold leading-tight">
          {timeOf(first.depart_at)}
        </span>
        <span className="font-mono text-[10px] font-semibold tracking-[.06em] text-[#3A4557]">
          {first.origin ?? "—"}
        </span>
      </div>
      <div className="relative min-w-[34px] flex-1 px-1 text-center">
        <span className="block text-[9.5px] font-semibold text-[#3A4557]">
          {formatDuration(legMinutes(segments))}
        </span>
        <span className="my-0.5 block h-px bg-[#DFE5EC]" />
        <span className="block whitespace-nowrap text-[9.5px] text-[#64748B]">
          {stopsLabel(segments)}
        </span>
      </div>
      <div className="text-right">
        <span className="block font-mono text-sm font-semibold leading-tight">
          {timeOf(last.arrive_at)}
        </span>
        <span className="font-mono text-[10px] font-semibold tracking-[.06em] text-[#3A4557]">
          {last.destination ?? "—"}
        </span>
      </div>
    </div>
  )
}

// --- Painel de publicação ----------------------------------------------------

function PublishPanel({
  caseId,
  token,
  proposal,
  offers,
  serverOffers,
  pax,
  pending,
  saveState,
  onError,
  onDone,
  onRevision,
  t,
}: {
  caseId: string
  token: string
  proposal: Proposal
  offers: OfferState[]
  serverOffers: AdminOffer[]
  pax: PaxCounts
  pending: boolean
  saveState: "idle" | "saving" | "saved" | "error"
  onError: (message: string | null) => void
  onDone: () => void
  onRevision: () => void
  t: Translator
}) {
  const published = proposal.status === "publicada"
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      serverOffers.map((o) => [o.id, o.include_in_proposal !== false])
    )
  )
  const [message, setMessage] = useState(proposal.opening_message ?? "")
  const [notifyClient, setNotifyClient] = useState(true)
  const [notifyTeam, setNotifyTeam] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)
  const [publishing, startPublish] = useTransition()

  useEffect(() => {
    setIncluded((prev) =>
      Object.fromEntries(
        serverOffers.map((o) => [
          o.id,
          prev[o.id] ?? o.include_in_proposal !== false,
        ])
      )
    )
  }, [serverOffers])

  const going = offers.filter((o) => included[o.id])
  const blockers = going.flatMap((offer, i) => {
    const problems = offerBlockers(asOffer(offer, i), pax)
    return problems.length === 0
      ? []
      : [
          t("blockers.line", {
            offer: offer.name || t("admin.composerUnnamed"),
            problems: problems.map((b) => blockerText(b, t)).join(", "),
          }),
        ]
  })

  function publish() {
    onError(null)
    setWarning(null)
    startPublish(async () => {
      // Grava a mensagem de abertura antes de publicar; a gravação automática
      // só cobre a oferta aberta, e esta caixa não pertence a nenhuma.
      await saveProposalMeta(caseId, { openingMessage: message })
      const result = await publishProposal(caseId, {
        includedOfferIds: going.map((o) => o.id),
        openingMessage: message,
        notifyClient,
        notifyTeam,
      })
      if (result.error) onError(result.error)
      else {
        if (result.warning) setWarning(result.warning)
        onDone()
      }
    })
  }

  if (published) {
    return (
      <section className="rounded-xl border border-adm-line bg-adm-panel">
        <header className="border-b border-adm-line-soft p-3.5">
          <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
            {t("admin.publishedTitle")}
          </h2>
        </header>
        <div className="space-y-3.5 p-3.5">
          <p className="text-[12.5px] leading-relaxed text-adm-txt-2">
            {t("admin.publishedBody", {
              revision: proposal.revision,
              when: proposal.published_at
                ? t("admin.publishedAt", {
                    when: new Intl.DateTimeFormat("pt-PT", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Atlantic/Cape_Verde",
                    }).format(new Date(proposal.published_at)),
                  })
                : "",
            })}
          </p>
          {proposal.selected_offer_id && (
            <p className="rounded-lg bg-adm-ok/10 p-3 text-[12px] leading-relaxed text-adm-ok">
              {t("admin.publishedChosen")}
            </p>
          )}
          <CopyLink token={token} t={t} />
          <button
            type="button"
            onClick={onRevision}
            disabled={pending}
            className="w-full rounded-lg border border-adm-line bg-adm-panel-2 px-4 py-2.5 text-[13px] font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt disabled:opacity-60"
          >
            {t("admin.publishedNewRevision", { next: proposal.revision + 1 })}
          </button>
          <p className="text-[11px] leading-relaxed text-adm-muted">
            {t("admin.publishedRevisionHint")}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-adm-line bg-adm-panel">
      <header className="flex items-center gap-2.5 border-b border-adm-line-soft p-3.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {t("admin.publishTitle")}
        </h2>
        <span className="ml-auto text-[11px] text-adm-muted">
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("admin.publishSaving")}
            </span>
          )}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-adm-ok">
              <Check className="h-3 w-3" /> {t("admin.publishSaved")}
            </span>
          )}
        </span>
      </header>

      <div className="p-3.5">
        {offers.length === 0 ? (
          <p className="text-[12.5px] text-adm-muted">
            {t("admin.publishNoOffers")}
          </p>
        ) : (
          offers.map((offer, i) => (
            <label
              key={offer.id}
              className="flex items-center gap-2.5 border-b border-adm-line-soft py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={included[offer.id] ?? true}
                onChange={(e) =>
                  setIncluded((prev) => ({
                    ...prev,
                    [offer.id]: e.target.checked,
                  }))
                }
                className="h-[15px] w-[15px] accent-adm-ember"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-adm-txt">
                {offer.name || t("admin.composerUnnamed")}
              </span>
              <span className="font-mono text-[13px] font-semibold text-adm-txt-2">
                {formatMoney(
                  offerTotal(asOffer(offer, i), pax),
                  proposal.currency
                )}
              </span>
            </label>
          ))
        )}

        <div className="mt-3.5">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.07em] text-adm-muted">
            {t("admin.publishMessage")}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("admin.publishMessagePlaceholder")}
            className={cn(inputClass, "min-h-[64px] resize-y leading-relaxed")}
          />
        </div>

        <div className="mt-3.5 flex flex-col gap-2.5">
          <Check2
            label={t("admin.publishNotifyEmail")}
            checked={notifyClient}
            onChange={setNotifyClient}
          />
          <Check2
            label={t("admin.publishNotifyTeam")}
            checked={notifyTeam}
            onChange={setNotifyTeam}
          />
          <label className="flex cursor-not-allowed items-center gap-2.5 text-[13px] text-adm-muted opacity-60">
            <input
              type="checkbox"
              disabled
              className="h-[15px] w-[15px] accent-adm-ember"
            />
            {t("admin.publishNotifyWhatsapp")}
            <span className="text-[11px]">
              {t("admin.publishNotifyWhatsappHint")}
            </span>
          </label>
        </div>

        {blockers.length > 0 && (
          <div className="mt-3.5 rounded-[9px] bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
            <b className="mb-1 block">{t("admin.publishBlockers")}</b>
            <ul className="list-inside list-disc space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3.5 rounded-[9px] bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
          {t("admin.publishWarning", { next: proposal.revision + 1 })}
        </div>

        {warning && (
          <div className="mt-3.5 rounded-[9px] bg-adm-warn/[.14] p-2.5 text-xs leading-relaxed text-[#F0C983]">
            {warning}
          </div>
        )}

        <div className="mt-3.5 flex flex-col gap-2">
          <button
            type="button"
            onClick={publish}
            disabled={
              publishing || pending || going.length === 0 || blockers.length > 0
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-adm-ember px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-adm-ember-dark disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("admin.publishCta")}
          </button>
          <p className="text-center text-[11px] text-adm-muted">
            {t("admin.publishAutoSave")}
          </p>
        </div>
      </div>
    </section>
  )
}

function CopyLink({ token, t }: { token: string; t: Translator }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(
          `${window.location.origin}/p/${token}/proposta`
        )
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-adm-line bg-adm-panel-2 px-4 py-2.5 text-[13px] font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? t("common.copied") : t("admin.publishedCopyLink")}
    </button>
  )
}

// --- Peças de formulário -----------------------------------------------------

const inputClass =
  "w-full rounded-lg border border-adm-line bg-adm-panel px-2.5 py-2 text-[13px] text-adm-txt outline-none transition-colors placeholder:text-[#5D6B82] focus:border-[#46587A] disabled:opacity-50"

const SPANS: Record<number, string> = {
  2: "col-span-6 sm:col-span-2",
  3: "col-span-6 sm:col-span-3",
  4: "col-span-12 sm:col-span-4",
  6: "col-span-12 sm:col-span-6",
  12: "col-span-12",
}

function Field({
  label,
  span,
  hint,
  children,
}: {
  label: string
  span: number
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", SPANS[span])}>
      <label className="text-[10px] font-bold uppercase tracking-[.07em] text-adm-muted">
        {label}
      </label>
      {children}
      {hint && <span className="text-[10.5px] text-adm-muted">{hint}</span>}
    </div>
  )
}

function Input({
  value,
  onChange,
  mono,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  mono?: boolean
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClass, mono && "font-mono")}
    />
  )
}

/** Normaliza no blur: quem escreve "545" fica com "545,00" e vê o que gravou. */
function MoneyInput({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onChange(formatAmountPlain(parseMoney(value)))}
      className={cn(inputClass, "text-right font-mono")}
    />
  )
}

function PriceRow({
  label,
  hint,
  qty,
  value,
  onChange,
  tone,
}: {
  label: string
  hint: string
  qty: string
  value: string
  onChange: (value: string) => void
  tone?: "fee"
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_96px_128px] items-center gap-2.5 border-b border-adm-line-soft px-3 py-2.5",
        tone === "fee" && "bg-adm-ember/[.06]"
      )}
    >
      <div>
        <span className="text-[13px] font-semibold text-adm-txt">{label}</span>
        <small className="block text-[11px] font-medium text-adm-muted">
          {hint}
        </small>
      </div>
      <div className="text-center font-mono text-xs text-adm-muted">{qty}</div>
      <MoneyInput value={value} onChange={onChange} />
    </div>
  )
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="text-[11px] font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {title}
        </h3>
        <span className="h-px flex-1 bg-adm-line-soft" />
        {aside && (
          <span className="text-[11px] text-adm-muted">{aside}</span>
        )}
      </div>
      {children}
    </section>
  )
}

function Flag({
  label,
  on,
  tone,
  disabled,
  onClick,
}: {
  label: string
  on: boolean
  tone?: "ok"
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-[7px] border px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50",
        !on && "border-adm-line bg-adm-panel-2 text-adm-muted hover:text-adm-txt-2",
        on && tone === "ok" && "border-adm-ok/40 bg-adm-ok/[.14] text-adm-ok",
        on && tone !== "ok" && "border-adm-txt bg-adm-txt text-adm-panel"
      )}
    >
      {label}
    </button>
  )
}

function IconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[9px] border border-adm-line bg-adm-panel-2 p-1.5 text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  )
}

function Check2({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2.5 text-[13px] text-adm-txt-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[15px] w-[15px] accent-adm-ember"
      />
      {label}
    </label>
  )
}
