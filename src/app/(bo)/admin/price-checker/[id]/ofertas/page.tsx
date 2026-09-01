import { notFound } from "next/navigation"

import { getBoAccess, listBoSellers } from "@/lib/bo-access"
import { getCase, type BookingCaseRow } from "@/lib/booking-cases"
import { loadBoCase } from "@/lib/pc/bo-queue"
import {
  ensureProposalForRender,
  paxOf,
  type ProposalFailure,
} from "@/lib/proposals"
import { BoProposalComposer } from "@/components/bo/proposal-composer"
import { BoCaseHeader } from "@/components/bo/case-header"
import { getDictionary, getI18n } from "@/i18n/server"
import { DEFAULT_LOCALE } from "@/i18n/config"
import { I18nProvider } from "@/i18n/provider"

/**
 * O compositor de propostas, dentro do back-office do Price Checker.
 *
 * Estava em /admin/casos/{id}/ofertas, no back-office antigo, e a ficha do caso
 * daqui limitava-se a apontar para lá — dois back-offices para o mesmo caso, e
 * o único sítio onde se compunha uma proposta era o que ia desaparecer.
 *
 * BO-08 · o cabeçalho do caso passa a estar aqui.
 *
 * Entrar neste ecrã fazia o cabeçalho e as abas desaparecerem: ficava uma
 * migalha de pão e três colunas de formulário, e quem estava a escrever um
 * preço perdia de vista a referência, o estado, o mercado, o vendedor e há
 * quanto tempo o cliente espera. A barra viva (`BoLiveUpdates`) sempre esteve
 * no layout e continua; o que faltava era o cabeçalho — e ele faltava porque
 * vivia dentro do componente da ficha, que é outra rota.
 *
 * `BoCaseHeader` é agora o mesmo componente nos dois sítios. Aqui vai sem
 * `onSelect`, o que faz as abas serem links para a ficha, com o indicador em
 * "Propostas" — que é onde a pessoa está.
 */

export const dynamic = "force-dynamic"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : value
}

export default async function BoCaseOffersPage({
  params,
}: {
  params: { id: string }
}) {
  /* O layout já redireciona quem não tem sessão e já mostra o ecrã de "sem
     acesso". Aqui a verificação repete-se porque uma página protegida não
     protege o que ela renderiza — e este ecrã lê preços de custo. */
  const access = await getBoAccess()
  if (!access.ok) return null

  const { locale, t, dictionary } = getI18n()
  const fallback =
    locale === DEFAULT_LOCALE ? undefined : getDictionary(DEFAULT_LOCALE)

  const [bookingCase, detail, sellers] = await Promise.all([
    getCase(params.id),
    loadBoCase(params.id),
    listBoSellers(),
  ])
  if (!bookingCase) notFound()

  /* A moeda da proposta nasce da moeda em que o cliente pediu a cotação. Sem
     isto a proposta nascia sempre em CVE, e o ecrã do cliente mostrava os
     números em EUR — o mesmo valor lido em duas moedas diferentes. */
  const result = await ensureProposalForRender(
    bookingCase.id,
    bookingCase.trip_request?.currency || "CVE"
  )

  return (
    <I18nProvider locale={locale} dictionary={dictionary} fallback={fallback}>
      {/*
        O cabeçalho fica fora de `.page` de propósito: a `.casebar` tem o seu
        próprio fundo e a sua própria linha inferior, e desenhá-la dentro do
        contentor com margens da página cortava-a a meio.

        O contacto por WhatsApp (FB-05) vem dentro do cabeçalho, ao lado de "Ver
        como cliente" — é o mesmo botão que a ficha tem, e agora está nos dois
        ecrãs por só existir um sítio onde ele é escrito.
      */}
      {detail && (
        <BoCaseHeader
          detail={detail}
          sellers={sellers}
          active="t-propostas"
          counts={{ "t-propostas": result.ok ? result.view.offers.length : 0 }}
        />
      )}

      <div className="page">
        {/* `composer-scope`: ver o fim de styles/bo-pc.css — devolve aos campos
            do compositor os tamanhos que o CSS global deste layout lhes tirava. */}
        <div className="composer-scope">
          {!result.ok ? (
            <div className="rounded-xl border border-adm-line bg-adm-panel p-8 text-center">
              <p className="text-[13px] text-adm-muted">
                {t(FAILURE_MESSAGE[result.reason])}
              </p>
            </div>
          ) : (
            <BoProposalComposer
              caseId={bookingCase.id}
              token={bookingCase.token}
              proposal={result.view.proposal}
              offers={result.view.offers}
              pax={paxOf(bookingCase.trip_request)}
              /* BO-07 · o compositor mede o itinerário contra o que o cliente
                 pediu, e não deixa publicar uma oferta noutras datas: mudá-las
                 é a ação "Propor novas datas", na ficha do caso. */
              requested={{
                departDate: bookingCase.trip_request?.depart_date ?? null,
                returnDate: bookingCase.trip_request?.return_date ?? null,
              }}
              /* VIP-10 · o que o cliente pediu em malas de porão, ao lado do
                 contador da oferta. Pedidos anteriores à migração 0012 não têm
                 o campo e ficam a zero, que é o que já se via. */
              requestedBaggage={bookingCase.trip_request?.baggage_hold ?? 0}
              /* FB-01 · a rota do pedido, para marcar os campos que ainda a
                 têm. Ver o comentário na propriedade. */
              requestedRoute={{
                origin: bookingCase.trip_request?.origin ?? null,
                destination: bookingCase.trip_request?.destination ?? null,
              }}
              brief={<ClientBrief bookingCase={bookingCase} />}
            />
          )}
        </div>
      </div>
    </I18nProvider>
  )
}

/**
 * A mensagem certa para cada causa.
 *
 * Antes havia só uma, a culpar a migração 0005, e por isso mandava o vendedor
 * chamar quem migra a base de dados quando o problema era a sessão dele a
 * expirar a meio do carregamento — em que recarregar a página resolve.
 */
const FAILURE_MESSAGE: Record<ProposalFailure, string> = {
  no_session: "admin.composerSessionExpired",
  denied: "admin.composerNoAccess",
  schema_missing: "admin.composerSchemaMissing",
  unknown: "admin.composerProposalFailed",
}

/**
 * O que o cliente pediu, à esquerda e sempre visível.
 *
 * Renderizado no servidor e passado como filho ao compositor: é conteúdo
 * estático, não tem razão nenhuma para ir em JavaScript para o browser.
 */
function ClientBrief({ bookingCase }: { bookingCase: BookingCaseRow }) {
  const { t } = getI18n()
  const trip = bookingCase.trip_request
  const link1 = bookingCase.links.find((l) => l.stage === 1)

  return (
    <aside className="rounded-xl border border-adm-line bg-adm-panel xl:sticky xl:top-[18px]">
      <header className="border-b border-adm-line-soft p-3.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[.11em] text-adm-muted">
          {t("admin.briefTitle")}
        </h2>
      </header>

      <div className="p-3.5">
        {!trip ? (
          <p className="text-[12.5px] leading-relaxed text-adm-muted">
            {t("admin.briefNoRequest")}
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between rounded-[10px] border border-adm-line bg-adm-panel-2 p-3">
              <div>
                <div className="font-mono text-[19px] font-semibold tracking-[.04em] text-adm-txt">
                  {trip.origin}
                </div>
              </div>
              <div className="text-adm-muted">→</div>
              <div className="text-right">
                <div className="font-mono text-[19px] font-semibold tracking-[.04em] text-adm-txt">
                  {trip.destination}
                </div>
              </div>
            </div>

            <Kv
              label={t("admin.briefType")}
              value={t("tripTypes." + trip.trip_type)}
            />
            <Kv label={t("admin.briefOut")} value={formatDate(trip.depart_date)} mono />
            {trip.return_date && (
              <Kv
                label={t("admin.briefBack")}
                value={formatDate(trip.return_date)}
                mono
              />
            )}
            <Kv label={t("admin.briefAdults")} value={String(trip.adults)} mono />
            {trip.children > 0 && (
              <Kv
                label={t("admin.briefChildren")}
                value={String(trip.children)}
                mono
              />
            )}
            {trip.infants > 0 && (
              <Kv label={t("admin.briefInfants")} value={String(trip.infants)} mono />
            )}
            <Kv
              label={t("admin.briefClass")}
              value={t("cabins." + trip.cabin_class)}
            />
            {/* VIP-10 · a bagagem pedida entra no resumo do pedido, que é onde
                quem cota olha antes de escrever a oferta. */}
            <Kv
              label={t("admin.briefBaggage")}
              value={
                trip.baggage_hold > 0 ? String(trip.baggage_hold) : t("admin.briefBaggageNone")
              }
              mono={trip.baggage_hold > 0}
            />
            <Kv
              label={t("admin.briefChannel")}
              value={
                trip.lead?.source_channel
                  ? t("channels." + trip.lead.source_channel)
                  : "—"
              }
            />

            {link1?.first_opened_at && (
              <div className="mt-3 flex items-center gap-2 text-xs text-adm-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-adm-ok" />
                {t("admin.briefLinkOpened")}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-adm-line-soft py-2 text-[13px] last:border-b-0">
      <span className="text-adm-muted">{label}</span>
      <span
        className={`text-right font-semibold text-adm-txt ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}
