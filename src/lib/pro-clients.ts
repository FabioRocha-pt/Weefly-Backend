/**
 * WeeFly Pro · PRO-05 · os clientes da empresa, construídos a partir dos casos.
 *
 * Não há tabela de clientes: um cliente é quem aparece nos leads dos casos da
 * empresa, juntado pelo email (ou pelo telefone, quando não há email). Assim a
 * lista nunca discorda dos casos — é uma leitura deles.
 *
 * O isolamento (TEN-03 · A5): lido pelo cliente da sessão, com o RLS da 0020
 * a decidir, e filtrado pelo parceiro da sessão (`getBoScope`). Quem não tem
 * acesso ao back-office não tem clientes: os clientes são os dos casos, e os
 * casos são do back-office.
 *
 * SÓ SERVIDOR.
 */

import { getBoScope } from "@/lib/bo-scope"
import type { ProAccount } from "@/lib/pro-account"

export interface ClientCase {
  caseId: string
  reference: string | null
  origin: string | null
  destination: string | null
  departDate: string | null
  stage: string
  closed: boolean
  createdAt: string
}

export interface ProClient {
  /** O lead do pedido mais recente: é por ele que se abre o cliente. */
  leadId: string
  /** OCT-17 · de que parceiro é (um cliente é por parceiro, TEN-03). */
  partnerId: string | null
  partnerName: string | null
  name: string
  email: string | null
  phone: string | null
  requests: number
  lastRequestAt: string
  cases: ClientCase[]
}

interface CaseRow {
  id: string
  partner_id: string | null
  partner: { commercial_name: string } | { commercial_name: string }[] | null
  stage: string
  created_at: string
  closed_at: string | null
  lead: {
    id: string
    full_name: string
    email: string | null
    phone_prefix: string | null
    phone: string | null
  } | null
  trip: {
    reference: string
    origin: string
    destination: string
    depart_date: string
  } | null
}

/** Até onde se lê. Um cliente com mais do que isto já não cabe num ecrã. */
const LIMIT = 2000

function clientKey(lead: NonNullable<CaseRow["lead"]>): string | null {
  const email = (lead.email ?? "").trim().toLowerCase()
  if (email) return `e:${email}`
  const digits = `${lead.phone_prefix ?? ""}${lead.phone ?? ""}`.replace(/\D/g, "")
  return digits ? `p:${digits}` : null
}

export type ClientsResult =
  | { ok: true; clients: ProClient[] }
  | { ok: false; reason: "no_access" | "error" }

export interface ClientFilters {
  /** OCT-17 · só para quem vê todos os parceiros: um parceiro. */
  partnerId?: string | null
  /** OCT-17 · nome, telefone ou email. */
  q?: string | null
}

/** O texto de pesquisa, sem acentos nem maiúsculas. */
function fold(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

function matches(client: ProClient, q: string): boolean {
  const needle = fold(q).trim()
  if (!needle) return true
  const digits = needle.replace(/\D/g, "")
  return (
    fold(client.name).includes(needle) ||
    fold(client.email).includes(needle) ||
    (digits.length >= 3 && (client.phone ?? "").replace(/\D/g, "").includes(digits))
  )
}

/**
 * Todos os clientes da empresa da conta, o mais recente primeiro.
 *
 * OCT-17 · para o Admin WeeFly (`crossPartner`), os de todos os parceiros, com
 * filtro por parceiro e pesquisa. Uma conta de parceiro nunca passa do dela: o
 * filtro de parceiro só se aplica a quem vê mais do que um.
 */
export async function loadProClients(
  _account: ProAccount,
  filters: ClientFilters = {}
): Promise<ClientsResult> {
  const scope = await getBoScope()
  if (!scope) return { ok: false, reason: "no_access" }

  let query = scope.db
    .from("booking_cases")
    .select(
      "id, partner_id, stage, created_at, closed_at, partner:partners(commercial_name), lead:leads(id, full_name, email, phone_prefix, phone), trip:trip_requests(reference, origin, destination, depart_date)"
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT)

  if (scope.partnerId) query = query.eq("partner_id", scope.partnerId)
  else if (filters.partnerId && scope.identity.profile?.crossPartner) {
    query = query.eq("partner_id", filters.partnerId)
  }

  const { data, error } = await query
  if (error) {
    console.error("[pro] clientes", error)
    return { ok: false, reason: "error" }
  }

  const byKey = new Map<string, ProClient>()
  for (const row of (data ?? []) as unknown as CaseRow[]) {
    if (!row.lead) continue
    const own = clientKey(row.lead)
    if (!own) continue
    const key = `${row.partner_id ?? ""}|${own}`
    const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner

    const item: ClientCase = {
      caseId: row.id,
      reference: row.trip?.reference ?? null,
      origin: row.trip?.origin ?? null,
      destination: row.trip?.destination ?? null,
      departDate: row.trip?.depart_date ?? null,
      stage: row.stage,
      closed: Boolean(row.closed_at),
      createdAt: row.created_at,
    }

    const existing = byKey.get(key)
    if (existing) {
      existing.requests += 1
      existing.cases.push(item)
      existing.email ??= row.lead.email
      existing.phone ??= formatPhone(row.lead)
      continue
    }

    /* As linhas vêm do mais recente para o mais antigo: a primeira de cada
       cliente é o pedido mais recente, e o nome dele é o que vale. */
    byKey.set(key, {
      leadId: row.lead.id,
      partnerId: row.partner_id,
      partnerName: partner?.commercial_name ?? null,
      name: row.lead.full_name,
      email: row.lead.email,
      phone: formatPhone(row.lead),
      requests: 1,
      lastRequestAt: row.created_at,
      cases: [item],
    })
  }

  const clients = Array.from(byKey.values())
  return { ok: true, clients: filters.q ? clients.filter((c) => matches(c, filters.q!)) : clients }
}

/** Um cliente, aberto pelo lead do seu pedido mais recente. */
export async function loadProClient(
  account: ProAccount,
  leadId: string
): Promise<ProClient | null> {
  const result = await loadProClients(account)
  if (!result.ok) return null
  /* Procura-se na lista da própria empresa, e não pelo id directamente: um
     lead de outra empresa aberto pelo endereço não existe aqui (TEN-03). */
  return result.clients.find((c) => c.leadId === leadId) ?? null
}

function formatPhone(lead: NonNullable<CaseRow["lead"]>): string | null {
  const phone = (lead.phone ?? "").trim()
  if (!phone) return null
  const prefix = (lead.phone_prefix ?? "").trim()
  return prefix && !phone.startsWith("+") ? `${prefix} ${phone}` : phone
}
