/**
 * WeeFly · B2G v2 · B2G-19 · o registo.
 *
 * "No backoffice da empresa, por ministério: cada pedido, reclamação, oferta,
 * envio, escolha, passageiro registado e emissão, com hora e autor. No Admin,
 * o master vê o mesmo registo para todas as empresas."
 *
 * Uma leitura só, pela vista `b2g_activity` (migração 0038) — o RLS de cada
 * tabela de base decide o que aparece: a empresa só os seus, o master todos,
 * a secretária nada (não tem sessão Supabase). Os ecrãs do parceiro e do
 * Admin, e a exportação, chamam esta função; nunca combinam de outra forma.
 *
 * Tudo pelo cliente da sessão (`scope.db`).
 *
 * SÓ SERVIDOR.
 */

import type { BoScope } from "@/lib/bo-scope"

export type ActivitySource = "case_event" | "traveller_change" | "access_audit"

export interface ActivityRow {
  id: string
  source: ActivitySource
  at: string
  partnerId: string
  organisationId: string | null
  caseId: string | null
  caseReference: string | null
  secretaryId: string | null
  actorKind: string
  author: string | null
  action: string
  description: string | null
}

export interface ActivityFilters {
  /** Admin "todas as empresas": omitir. Parceiro: sempre o da sessão. */
  partnerId?: string | null
  /** Um ministério, ou todos (omitir) na visão geral. */
  organisationId?: string | null
  secretaryId?: string | null
  /** Dias de Cabo Verde, `AAAA-MM-DD`, inclusivos. */
  from?: string | null
  to?: string | null
}

/** Cabo Verde não tem horário de verão: UTC−1 o ano inteiro (como `lib/finance.ts`). */
const CV_OFFSET = "-01:00"
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function bounds(from?: string | null, to?: string | null): { gte: string | null; lt: string | null } {
  const gte = from && ISO_DAY.test(from) ? `${from}T00:00:00${CV_OFFSET}` : null
  let lt: string | null = null
  if (to && ISO_DAY.test(to)) {
    const [y, m, d] = to.split("-").map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    lt = `${next}T00:00:00${CV_OFFSET}`
  }
  return { gte, lt }
}

const COLUMNS =
  "id, source, at, partner_id, organisation_id, case_id, case_reference, secretary_id, actor_kind, author, action, description"

/** B2G-19 · as linhas do registo, filtradas, mais recente primeiro. */
export async function listActivity(
  scope: BoScope,
  filters: ActivityFilters = {},
  limit = 1000
): Promise<ActivityRow[]> {
  let q = scope.db.from("b2g_activity").select(COLUMNS).order("at", { ascending: false }).limit(limit)
  if (filters.partnerId) q = q.eq("partner_id", filters.partnerId)
  if (filters.organisationId) q = q.eq("organisation_id", filters.organisationId)
  if (filters.secretaryId) q = q.eq("secretary_id", filters.secretaryId)
  const { gte, lt } = bounds(filters.from, filters.to)
  if (gte) q = q.gte("at", gte)
  if (lt) q = q.lt("at", lt)

  const { data, error } = await q
  if (error) {
    console.error("[b2g-activity] registo:", error.message)
    return []
  }
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    source: r.source,
    at: r.at,
    partnerId: r.partner_id,
    organisationId: r.organisation_id ?? null,
    caseId: r.case_id ?? null,
    caseReference: r.case_reference ?? null,
    secretaryId: r.secretary_id ?? null,
    actorKind: r.actor_kind,
    author: r.author ?? null,
    action: r.action,
    description: r.description ?? null,
  }))
}

export interface ActivitySecretaryOption {
  id: string
  name: string
  organisationId: string
}

/** As secretárias para o filtro — de um ministério, ou de todas as do parceiro. */
export async function listActivitySecretaries(
  scope: BoScope,
  options: { partnerId?: string | null; organisationId?: string | null }
): Promise<ActivitySecretaryOption[]> {
  let q = scope.db.from("ministry_secretaries").select("id, name, organisation_id").order("name")
  if (options.organisationId) q = q.eq("organisation_id", options.organisationId)
  else if (options.partnerId) q = q.eq("partner_id", options.partnerId)
  const { data, error } = await q
  if (error) {
    console.error("[b2g-activity] secretárias:", error.message)
    return []
  }
  return ((data ?? []) as { id: string; name: string; organisation_id: string }[]).map((s) => ({
    id: s.id,
    name: s.name,
    organisationId: s.organisation_id,
  }))
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  /* Uma célula que comece por = + - @ é uma fórmula para o Excel: prefixa-se,
     para que um nome escrito por alguém não corra como código (como em `lib/finance.ts`). */
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Separado por ponto e vírgula e com BOM: o Excel em português abre direito. */
export function activityCsv(rows: ActivityRow[], headers: string[]): string {
  const lines = [headers.map(cell).join(";")]
  for (const r of rows) {
    lines.push(
      [new Date(r.at).toISOString().slice(0, 16).replace("T", " "), r.author, r.description, r.caseReference]
        .map(cell)
        .join(";")
    )
  }
  return "﻿" + lines.join("\r\n") + "\r\n"
}
