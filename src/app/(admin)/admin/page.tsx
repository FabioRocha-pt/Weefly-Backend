import Link from "next/link"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { listCases, type BookingCaseRow } from "@/lib/booking-cases"
import { createAdminClient } from "@/utils/supabase/admin"
import {
  CASE_STAGE_CHIP,
  CASE_STAGE_DISPLAY,
  WAITING_DOT,
  elapsedSince,
  formatAmount,
  type CaseStage,
} from "@/lib/case-status"
import { CreateCaseButton } from "@/components/admin/create-case-button"
import { CaseLinkButtons } from "@/components/admin/case-link-buttons"

export const dynamic = "force-dynamic"

/** Channel badges from the mockup. The DB vocabulary is narrower than the
 *  design's — anything unmapped falls back to a neutral chip. */
const CHANNEL: Record<string, { short: string; label: string }> = {
  whatsapp: { short: "WA", label: "WhatsApp" },
  chat: { short: "WEB", label: "Chat do site" },
  browser: { short: "WEB", label: "Formulário" },
  manual: { short: "MAN", label: "Manual" },
}

interface PaymentSummary {
  amount: number
  currency: string
}

/** Latest fare per case — the mockup's "Valor" column. */
async function paymentsByCase(
  caseIds: string[]
): Promise<Map<string, PaymentSummary>> {
  const out = new Map<string, PaymentSummary>()
  if (caseIds.length === 0) return out

  const admin = createAdminClient()
  if (!admin) return out

  const { data } = await admin
    .from("case_payments")
    .select("case_id, amount, currency, created_at")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false })

  for (const row of data ?? []) {
    // Ordered newest-first, so the first row per case wins.
    if (!out.has(row.case_id as string)) {
      out.set(row.case_id as string, {
        amount: row.amount as number,
        currency: row.currency as string,
      })
    }
  }
  return out
}

type Filter = "us" | "them" | "all"

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: { q?: string; f?: string }
}) {
  const search = searchParams.q ?? ""
  const filter: Filter =
    searchParams.f === "them" || searchParams.f === "all"
      ? searchParams.f
      : "us"

  const all = await listCases(search)
  const payments = await paymentsByCase(all.map((c) => c.id))

  const waitingOf = (c: BookingCaseRow) =>
    CASE_STAGE_DISPLAY[c.stage as CaseStage].waiting

  const cases =
    filter === "all" ? all : all.filter((c) => waitingOf(c) === filter)

  const openCases = all.filter((c) => !["emitido", "cancelado"].includes(c.stage))
  const kpis = {
    us: all.filter((c) => waitingOf(c) === "us").length,
    them: all.filter((c) => waitingOf(c) === "them").length,
    paidNoTicket: all.filter((c) => c.stage === "pago").length,
    neverOpened: all.filter((c) => c.links.every((l) => !l.first_opened_at))
      .length,
    issued: all.filter((c) => c.stage === "emitido").length,
  }

  return (
    <div className="space-y-5">
      {/* head */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-adm-txt">
            Links de atendimento
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-adm-muted">
            Cada cliente atendido por chat tem um link e uma referência únicos.
            Aqui cria-se o link, acompanha-se onde o cliente parou e reenvia-se
            quando é preciso.
          </p>
        </div>
        <CreateCaseButton />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi
          dot="us"
          label="Espera por nós"
          value={kpis.us}
          sub="a cotar ou a validar"
          hot
        />
        <Kpi
          dot="them"
          label="Espera pelo cliente"
          value={kpis.them}
          sub="a preencher ou a pagar"
        />
        <Kpi
          dot="us"
          label="Pago, ainda sem bilhete"
          value={kpis.paidNoTicket}
          sub={kpis.paidNoTicket > 0 ? "precisa de emissão" : "nada pendente"}
          bad={kpis.paidNoTicket > 0}
        />
        <Kpi
          dot="off"
          label="Links nunca abertos"
          value={kpis.neverOpened}
          sub="o cliente ainda não entrou"
        />
        <Kpi dot="done" label="Emitidos" value={kpis.issued} sub="no total" />
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-adm-line bg-adm-panel p-2.5">
        <form action="/admin" className="relative min-w-[240px] flex-1">
          <input type="hidden" name="f" value={filter} />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-adm-muted" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Referência, nome, email, rota ou token"
            className="h-9 w-full rounded-lg border border-adm-line bg-adm-bg pl-8 pr-3 text-[13px] text-adm-txt outline-none transition-colors placeholder:text-adm-muted focus:border-adm-ember"
          />
        </form>

        <div className="flex items-center gap-1 rounded-lg border border-adm-line bg-adm-bg p-0.5">
          {(
            [
              ["us", "A aguardar nós"],
              ["them", "A aguardar cliente"],
              ["all", "Tudo"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={`/admin?f=${key}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                filter === key
                  ? "bg-adm-raise text-adm-txt"
                  : "text-adm-muted hover:text-adm-txt-2"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        <span className="ml-auto pr-1 text-[12px] text-adm-muted">
          {openCases.length} casos abertos
        </span>
      </div>

      {/* table */}
      {cases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-adm-line bg-adm-panel py-16 text-center">
          <p className="font-semibold text-adm-txt">
            {search
              ? "Nenhum caso encontrado"
              : filter === "all"
                ? "Ainda sem links criados"
                : "Nada nesta vista"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-adm-muted">
            {search ? (
              <>
                Experimente outra pesquisa ou{" "}
                <Link href="/admin?f=all" className="font-semibold text-adm-ember">
                  ver todos
                </Link>
                .
              </>
            ) : filter === "all" ? (
              "Clique em “Novo link de atendimento” para criar o primeiro."
            ) : (
              <>
                Nenhum caso à espera. Veja{" "}
                <Link href="/admin?f=all" className="font-semibold text-adm-ember">
                  todos os casos
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-adm-line bg-adm-panel">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-adm-line text-[11px] uppercase tracking-wider text-adm-muted">
                <Th>Referência</Th>
                <Th>Cliente</Th>
                <Th>Canal</Th>
                <Th>Estado</Th>
                <Th>Rota</Th>
                <Th right>Valor</Th>
                <Th>Sem mexer há</Th>
                <Th>Links do cliente</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const trip = c.trip_request
                const display = CASE_STAGE_DISPLAY[c.stage as CaseStage]
                const payment = payments.get(c.id)
                const channelKey = trip?.lead?.source_channel ?? ""
                const channel = CHANNEL[channelKey]
                const opened = c.links.some((l) => l.first_opened_at)

                return (
                  <tr
                    key={c.id}
                    className="border-b border-adm-line-soft last:border-0 transition-colors hover:bg-adm-panel-2"
                  >
                    <Td>
                      <Link
                        href={`/admin/casos/${c.id}`}
                        className="font-mono text-[12.5px] font-semibold text-adm-txt hover:text-adm-ember"
                      >
                        {trip?.reference ?? "sem referência"}
                      </Link>
                      <div className="mt-0.5 font-mono text-[11px] text-adm-muted">
                        {c.token.slice(0, 10)}…
                      </div>
                    </Td>

                    <Td>
                      <div className="font-medium text-adm-txt">
                        {trip?.lead?.full_name ?? "Por preencher"}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-adm-muted">
                        {trip?.lead?.phone
                          ? `${trip.lead.phone_prefix ?? ""} ${trip.lead.phone}`.trim()
                          : (trip?.lead?.email ?? "contacto por preencher")}
                      </div>
                    </Td>

                    <Td>
                      {channel ? (
                        <span className="inline-flex items-center gap-1.5 text-adm-txt-2">
                          <span className="rounded bg-adm-raise px-1.5 py-0.5 font-mono text-[10px] font-bold text-adm-muted">
                            {channel.short}
                          </span>
                          {channel.label}
                        </span>
                      ) : (
                        <span className="text-adm-muted">—</span>
                      )}
                    </Td>

                    <Td>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[11.5px] font-semibold",
                          CASE_STAGE_CHIP[c.stage as CaseStage]
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            WAITING_DOT[display.waiting]
                          )}
                        />
                        {display.code} · {display.label}
                      </span>
                    </Td>

                    <Td>
                      {trip ? (
                        <>
                          <div className="font-mono text-adm-txt-2">
                            {trip.origin} → {trip.destination}
                          </div>
                          <div className="mt-0.5 text-[11px] text-adm-muted">
                            {trip.adults}A
                            {trip.children > 0 && ` ${trip.children}C`}
                            {trip.infants > 0 && ` ${trip.infants}B`}
                          </div>
                        </>
                      ) : (
                        <span className="text-adm-muted">por preencher</span>
                      )}
                    </Td>

                    <Td right>
                      {payment ? (
                        <span className="font-mono text-adm-txt">
                          {formatAmount(payment.amount, payment.currency)}
                        </span>
                      ) : (
                        <span className="text-adm-muted">—</span>
                      )}
                    </Td>

                    <Td>
                      <div className="text-adm-txt-2">
                        {elapsedSince(c.updated_at)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-adm-muted">
                        {opened ? "link já aberto" : "nunca aberto"}
                      </div>
                    </Td>

                    <Td>
                      <CaseLinkButtons token={c.token} links={c.links} />
                    </Td>

                    <Td right>
                      <Link
                        href={`/admin/casos/${c.id}`}
                        className="inline-flex items-center rounded-md border border-adm-line bg-adm-raise px-2.5 py-1.5 text-[12px] font-semibold text-adm-txt-2 transition-colors hover:border-adm-muted hover:text-adm-txt"
                      >
                        Gerir
                      </Link>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Kpi({
  dot,
  label,
  value,
  sub,
  hot,
  bad,
}: {
  dot: keyof typeof WAITING_DOT
  label: string
  value: number
  sub: string
  hot?: boolean
  bad?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-adm-panel p-3.5",
        bad
          ? "border-adm-ember/40"
          : hot
            ? "border-adm-line hover:border-adm-muted"
            : "border-adm-line"
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-adm-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", WAITING_DOT[dot])} />
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[26px] font-bold leading-none text-adm-txt">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-adm-muted">{sub}</div>
    </div>
  )
}

function Th({
  children,
  right,
}: {
  children?: React.ReactNode
  right?: boolean
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2.5 font-semibold",
        right && "text-right"
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  right,
}: {
  children?: React.ReactNode
  right?: boolean
}) {
  return (
    <td className={cn("px-3 py-3 align-top", right && "text-right")}>
      {children}
    </td>
  )
}
