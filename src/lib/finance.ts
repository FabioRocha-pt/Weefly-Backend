/**
 * WeeFly · MVP 2 · os números: PAR-08 (o parceiro) e ADM-03 (o Admin).
 *
 * "Os números batem exatamente com o ADM-03 — mesmos valores, âmbito
 * diferente." Por isso há uma leitura só, `listIssuedTickets`, e os dois
 * ecrãs e as duas exportações chamam-na. O âmbito é o único parâmetro que
 * muda: um parceiro, ou todos (só para quem vê todos os parceiros).
 *
 * O que é uma passagem emitida: um caso com `issued_at`. O valor cobrado é o
 * pagamento confirmado do caso — o do cliente ou, num ministério, o pagamento
 * externo, que o PAR-07 também regista como confirmado. O custo é o custo real
 * que o agente escreveu na emissão (`cost_real`). A comissão (ADM-07) fica
 * vazia até às decisões C1/D1/D7/D8: lê-se do caso e nunca se calcula aqui.
 *
 * Tudo pelo cliente da sessão (o RLS da 0020 decide o que se lê). Os montantes
 * em unidades menores, como no resto da plataforma, e somados por moeda — dois
 * casos em moedas diferentes não se somam.
 *
 * SÓ SERVIDOR.
 */

import type { BoScope } from "@/lib/bo-scope"

export type Period = "today" | "week" | "month" | "year" | "custom"

export interface PeriodRange {
  period: Period
  /** Dias de Cabo Verde, inclusivos. */
  from: string
  to: string
}

export interface IssuedTicket {
  caseId: string
  reference: string | null
  partnerId: string
  partnerName: string
  organisationId: string | null
  organisationName: string | null
  route: string
  issuedAt: string
  issuedByEmail: string | null
  pnr: string | null
  /** Passagens: uma por passageiro do caso. */
  tickets: number
  currency: string
  cost: number | null
  charged: number | null
  commissionRate: number | null
  commissionAmount: number | null
}

export interface MoneyTotals {
  currency: string
  cases: number
  tickets: number
  cost: number
  charged: number
  commission: number
  /** Casos sem custo real ou sem valor cobrado: os totais ficam curtos deles. */
  missingCost: number
  missingCharged: number
}

export interface GroupTotals {
  key: string
  label: string
  partnerName?: string
  totals: MoneyTotals[]
}

// ── O período ────────────────────────────────────────────────────────────────

/** Cabo Verde não tem horário de verão: UTC−1 o ano inteiro. */
const CV_OFFSET = "-01:00"

function cvDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Cape_Verde" }).format(date)
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function periodRange(input: { period?: string | null; from?: string | null; to?: string | null }): PeriodRange {
  const today = cvDay()
  const [y, m, d] = today.split("-").map(Number)
  const period = (["today", "week", "month", "year", "custom"] as const).find((p) => p === input.period) ?? "month"

  if (period === "custom" && input.from && ISO_DAY.test(input.from)) {
    const to = input.to && ISO_DAY.test(input.to) ? input.to : today
    return input.from <= to
      ? { period, from: input.from, to }
      : { period, from: to, to: input.from }
  }
  if (period === "today") return { period, from: today, to: today }
  if (period === "week") {
    /* A semana começa à segunda. */
    const base = new Date(Date.UTC(y, m - 1, d))
    const back = (base.getUTCDay() + 6) % 7
    base.setUTCDate(base.getUTCDate() - back)
    return { period, from: base.toISOString().slice(0, 10), to: today }
  }
  if (period === "year") return { period, from: `${y}-01-01`, to: today }
  return { period: period === "custom" ? "month" : period, from: `${today.slice(0, 7)}-01`, to: today }
}

function bounds(range: PeriodRange): { gte: string; lt: string } {
  const [y, m, d] = range.to.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return { gte: `${range.from}T00:00:00${CV_OFFSET}`, lt: `${next}T00:00:00${CV_OFFSET}` }
}

// ── A leitura ────────────────────────────────────────────────────────────────

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

const PAID = ["COMPLETED", "PARTIALLY_REFUNDED"]

/**
 * As passagens emitidas no período. `partnerId` nulo lê todos os parceiros —
 * e só se pede isso depois de confirmar que a sessão os vê todos (ADM-03).
 */
export async function listIssuedTickets(
  scope: BoScope,
  options: { partnerId: string | null; organisationId?: string | null; range: PeriodRange }
): Promise<IssuedTicket[]> {
  const { gte, lt } = bounds(options.range)
  const rows: Record<string, any>[] = []

  /* Aos blocos de 1000, que é o tecto do PostgREST: um ano inteiro de
     emissões não pode sair cortado sem ninguém dar por isso. */
  for (let from = 0; ; from += 1000) {
    let q = scope.db
      .from("booking_cases")
      .select(
        `id, partner_id, organisation_id, pnr, issued_at, cost_real, commission_rate, commission_amount,
         trip_request:trip_requests(reference, origin, destination, currency),
         partner:partners(commercial_name),
         organisation:organisations(name),
         passengers:case_passengers(id),
         payments:case_payments(status, amount, received_amount, currency, created_at)`
      )
      .not("issued_at", "is", null)
      .gte("issued_at", gte)
      .lt("issued_at", lt)
      .order("issued_at", { ascending: false })
      .range(from, from + 999)
    if (options.partnerId) q = q.eq("partner_id", options.partnerId)
    if (options.organisationId) q = q.eq("organisation_id", options.organisationId)
    const { data, error } = await q
    if (error) {
      console.error("[finance] emissões:", error.message)
      break
    }
    rows.push(...((data ?? []) as Record<string, any>[]))
    if (!data || data.length < 1000) break
  }

  /* Quem emitiu: o autor do acontecimento da emissão, que guarda o email tal
     como era no momento — a conta pode ter mudado de nome desde então. */
  const issuers = new Map<string, string>()
  const ids = rows.map((r) => r.id as string)
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await scope.db
      .from("case_events")
      .select("case_id, actor_email, created_at")
      .in("case_id", ids.slice(i, i + 200))
      .eq("kind", "tickets_issued")
      .order("created_at", { ascending: false })
    for (const e of (data ?? []) as { case_id: string; actor_email: string | null }[]) {
      if (!issuers.has(e.case_id) && e.actor_email) issuers.set(e.case_id, e.actor_email)
    }
  }

  return rows.map((r) => {
    const trip = one(r.trip_request) as Record<string, any> | null
    const payments = ((r.payments ?? []) as Record<string, any>[])
      .filter((p) => PAID.includes(p.status))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    const paid = payments[0]
    return {
      caseId: r.id,
      reference: trip?.reference ?? null,
      partnerId: r.partner_id,
      partnerName: (one(r.partner) as { commercial_name: string } | null)?.commercial_name ?? "—",
      organisationId: r.organisation_id ?? null,
      organisationName: (one(r.organisation) as { name: string } | null)?.name ?? null,
      route: trip ? `${trip.origin ?? "?"} → ${trip.destination ?? "?"}` : "—",
      issuedAt: r.issued_at,
      issuedByEmail: issuers.get(r.id) ?? null,
      pnr: r.pnr ?? null,
      tickets: Math.max(1, ((r.passengers ?? []) as unknown[]).length),
      currency: String(paid?.currency ?? trip?.currency ?? "EUR"),
      cost: r.cost_real != null ? Number(r.cost_real) : null,
      charged: paid ? Number(paid.received_amount ?? paid.amount) : null,
      commissionRate: r.commission_rate != null ? Number(r.commission_rate) : null,
      commissionAmount: r.commission_amount != null ? Number(r.commission_amount) : null,
    }
  })
}

// ── As somas ─────────────────────────────────────────────────────────────────

export function totalsOf(rows: IssuedTicket[]): MoneyTotals[] {
  const by = new Map<string, MoneyTotals>()
  for (const r of rows) {
    const t =
      by.get(r.currency) ??
      { currency: r.currency, cases: 0, tickets: 0, cost: 0, charged: 0, commission: 0, missingCost: 0, missingCharged: 0 }
    t.cases += 1
    t.tickets += r.tickets
    if (r.cost != null) t.cost += r.cost
    else t.missingCost += 1
    if (r.charged != null) t.charged += r.charged
    else t.missingCharged += 1
    if (r.commissionAmount != null) t.commission += r.commissionAmount
    by.set(r.currency, t)
  }
  return Array.from(by.values()).sort((a, b) => b.cases - a.cases)
}

export function groupBy(rows: IssuedTicket[], dimension: "partner" | "organisation", noneLabel: string): GroupTotals[] {
  const groups = new Map<string, { label: string; partnerName?: string; rows: IssuedTicket[] }>()
  for (const r of rows) {
    const key = dimension === "partner" ? r.partnerId : (r.organisationId ?? `none:${r.partnerId}`)
    const label = dimension === "partner" ? r.partnerName : (r.organisationName ?? noneLabel)
    const g = groups.get(key) ?? { label, partnerName: dimension === "organisation" ? r.partnerName : undefined, rows: [] }
    g.rows.push(r)
    groups.set(key, g)
  }
  return Array.from(groups.entries())
    .map(([key, g]) => ({ key, label: g.label, partnerName: g.partnerName, totals: totalsOf(g.rows) }))
    .sort((a, b) => b.totals.reduce((s, t) => s + t.cases, 0) - a.totals.reduce((s, t) => s + t.cases, 0))
}

/** A linha temporal: por dia até dois meses, por mês daí para cima. */
export function timeline(rows: IssuedTicket[], range: PeriodRange): { bucket: string; cases: number; tickets: number }[] {
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000
  const monthly = days > 62
  const buckets = new Map<string, { cases: number; tickets: number }>()

  /* Todos os baldes do período, também os vazios: um dia sem emissões é uma
     informação, e um gráfico sem ele mente sobre o ritmo. */
  const cursor = new Date(`${range.from}T12:00:00Z`)
  const end = new Date(`${range.to}T12:00:00Z`)
  while (cursor <= end && buckets.size < 400) {
    const key = cursor.toISOString().slice(0, monthly ? 7 : 10)
    if (!buckets.has(key)) buckets.set(key, { cases: 0, tickets: 0 })
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1)
    else cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  for (const r of rows) {
    const key = cvDay(new Date(r.issuedAt)).slice(0, monthly ? 7 : 10)
    const b = buckets.get(key) ?? { cases: 0, tickets: 0 }
    b.cases += 1
    b.tickets += r.tickets
    buckets.set(key, b)
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([bucket, v]) => ({ bucket, ...v }))
}

// ── PAR-08 · por ministério: emitido, consumido, saldo ────────────────────────

export interface MinistryFinance {
  organisationId: string
  name: string
  currency: string
  /** O valor cobrado das passagens emitidas no período. */
  issued: number
  tickets: number
  /** O que saiu da bolsa no período: débitos menos estornos. */
  consumed: number
  /** O saldo de hoje — não depende do período. */
  balance: number
}

export async function ministryFinance(
  scope: BoScope,
  partnerId: string,
  rows: IssuedTicket[],
  range: PeriodRange
): Promise<MinistryFinance[]> {
  const { gte, lt } = bounds(range)
  const [orgRes, movRes, allRes] = await Promise.all([
    scope.db.from("organisations").select("id, name, currency").eq("partner_id", partnerId).order("name"),
    scope.db
      .from("budget_movements")
      .select("organisation_id, kind, delta")
      .eq("partner_id", partnerId)
      .in("kind", ["debit", "reversal"])
      .gte("created_at", gte)
      .lt("created_at", lt),
    scope.db.from("budget_movements").select("organisation_id, delta").eq("partner_id", partnerId),
  ])

  const orgs = (orgRes.data ?? []) as { id: string; name: string; currency: string }[]
  const inPeriod = (movRes.data ?? []) as { organisation_id: string; delta: number }[]
  const all = (allRes.data ?? []) as { organisation_id: string; delta: number }[]

  return orgs.map((o) => {
    const own = rows.filter((r) => r.organisationId === o.id)
    return {
      organisationId: o.id,
      name: o.name,
      currency: o.currency ?? "CVE",
      issued: own.reduce((s, r) => s + (r.charged ?? 0), 0),
      tickets: own.reduce((s, r) => s + r.tickets, 0),
      consumed: -inPeriod.filter((m) => m.organisation_id === o.id).reduce((s, m) => s + Number(m.delta), 0),
      balance: all.filter((m) => m.organisation_id === o.id).reduce((s, m) => s + Number(m.delta), 0),
    }
  })
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const money = (v: number | null) => (v == null ? "" : (v / 100).toFixed(2))

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  /* Uma célula que comece por = + - @ é uma fórmula para o Excel: prefixa-se,
     para que um nome escrito por um cliente não corra como código. */
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * Separado por ponto e vírgula e com BOM: é o que o Excel em português abre
 * direito, com os acentos e as colunas no sítio.
 */
export function ticketsCsv(rows: IssuedTicket[], headers: string[]): string {
  const lines = [headers.map(cell).join(";")]
  for (const r of rows) {
    lines.push(
      [
        r.issuedAt.slice(0, 10),
        r.reference,
        r.pnr,
        r.partnerName,
        r.organisationName,
        r.route,
        r.tickets,
        r.currency,
        money(r.cost),
        money(r.charged),
        r.cost != null && r.charged != null ? money(r.charged - r.cost) : "",
        r.commissionRate,
        money(r.commissionAmount),
        r.issuedByEmail,
      ]
        .map(cell)
        .join(";")
    )
  }
  return "﻿" + lines.join("\r\n") + "\r\n"
}
