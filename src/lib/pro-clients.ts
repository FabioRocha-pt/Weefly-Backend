/**
 * WeeFly Pro · PRO-05 · os clientes da empresa, construídos a partir dos casos.
 *
 * Não há tabela de clientes: um cliente é quem aparece nos leads dos casos da
 * empresa, juntado pelo email (ou pelo telefone, quando não há email). Assim a
 * lista nunca discorda dos casos — é uma leitura deles.
 *
 * O isolamento: cada empresa vê só os seus. Com a 0022 aplicada, a conta tem
 * empresa e filtra-se por `booking_cases.partner_id`. Na base antiga não há
 * empresa na conta, e qualquer registo novo entraria no Agente — por isso aí a
 * lista só abre a quem já tem acesso ao back-office (a allowlist), que é quem
 * hoje já vê estes casos no Price Checker.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { getBoAccess } from "@/lib/bo-access"
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
  name: string
  email: string | null
  phone: string | null
  requests: number
  lastRequestAt: string
  cases: ClientCase[]
}

interface CaseRow {
  id: string
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

/**
 * Todos os clientes da empresa da conta, o mais recente primeiro.
 */
export async function loadProClients(account: ProAccount): Promise<ClientsResult> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "error" }

  let query = admin
    .from("booking_cases")
    .select(
      "id, stage, created_at, closed_at, lead:leads(id, full_name, email, phone_prefix, phone), trip:trip_requests(reference, origin, destination, depart_date)"
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT)

  if (account.partner) {
    query = query.eq("partner_id", account.partner.id)
  } else {
    /* Base antiga, ou conta sem empresa: só quem já vê estes casos no
       back-office. Ver o cabeçalho. */
    const access = await getBoAccess()
    if (!access.ok || !account.legacy) return { ok: false, reason: "no_access" }
  }

  const { data, error } = await query
  if (error) {
    console.error("[pro] clientes", error)
    return { ok: false, reason: "error" }
  }

  const byKey = new Map<string, ProClient>()
  for (const row of (data ?? []) as unknown as CaseRow[]) {
    if (!row.lead) continue
    const key = clientKey(row.lead)
    if (!key) continue

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
      name: row.lead.full_name,
      email: row.lead.email,
      phone: formatPhone(row.lead),
      requests: 1,
      lastRequestAt: row.created_at,
      cases: [item],
    })
  }

  return { ok: true, clients: Array.from(byKey.values()) }
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
