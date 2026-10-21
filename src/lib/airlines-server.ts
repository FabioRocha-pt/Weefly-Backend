/**
 * As companhias da tabela `airlines`, lidas pelo servidor e registadas no
 * catálogo (`lib/airlines-catalog`).
 *
 * Um minuto em memória: o layout raiz chama isto em cada página, e a lista
 * muda quando alguém a edita no Admin — que chama `invalidateAirlines()` e
 * volta a ler logo a seguir, no mesmo processo.
 *
 * A leitura é `select("*")` de propósito: numa base sem a 0040 não há
 * `logo_url` nem `ticket_prefix`, e pedir as colunas pelo nome partia a
 * leitura toda. Se a tabela não responder, fica a lista do ficheiro.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { FALLBACK_AIRLINES, registerAirlines, type AirlineEntry } from "@/lib/airlines-catalog"

const TTL_MS = 60_000

let cache: { at: number; list: AirlineEntry[] } | null = null

export function invalidateAirlines(): void {
  cache = null
}

export async function loadAirlines(): Promise<AirlineEntry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list

  const admin = createAdminClient()
  const { data, error } = admin
    ? await admin.from("airlines").select("*")
    : { data: null, error: { message: "sem service role" } }

  if (error || !data?.length) {
    if (error) console.error("[companhias] leitura falhou:", error.message)
    const list = FALLBACK_AIRLINES.map((a) => ({ ...a, active: true, logoUrl: null, ticketPrefix: null }))
    /* Não guarda: na próxima página tenta outra vez. */
    return list
  }

  const list: AirlineEntry[] = (data as Record<string, unknown>[]).map((r) => ({
    iata: String(r.iata).toUpperCase(),
    name: String(r.name),
    priority: Number(r.priority) || 9,
    active: r.active !== false,
    logoUrl: typeof r.logo_url === "string" && r.logo_url ? r.logo_url : null,
    ticketPrefix: typeof r.ticket_prefix === "string" && r.ticket_prefix ? r.ticket_prefix : null,
  }))
  registerAirlines(list)
  cache = { at: Date.now(), list }
  return list
}
