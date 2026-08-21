/**
 * WeeFly back-office — travel request queries.
 *
 * Every read here goes through the normal (anon-key + session cookie) server
 * client, so Row Level Security decides what is visible. The `is_platform_staff()`
 * policy is the real access control; the UI guard is only there to render a
 * friendly page instead of an empty list.
 */

import { cache } from "react"

import { createClient } from "@/utils/supabase/server"
import { getCurrentUser } from "@/lib/current-user"
import type {
  RequestLead,
  RequestNote,
  RequestStats,
  RequestStatus,
  TravelRequestRow,
} from "@/lib/travel-request-status"

const REQUEST_COLUMNS = `
  id, reference, status, trip_type, origin, destination, depart_date,
  return_date, adults, children, infants, cabin_class, email_sent,
  team_notified, created_at,
  lead:leads (id, title, full_name, email, phone_prefix, phone, source_channel)
`

/**
 * Supabase types a `!inner`-less embed as an array in some versions; normalise
 * it so callers always get a single lead or null.
 */
function normaliseRow(row: Record<string, unknown>): TravelRequestRow {
  const lead = row.lead
  return {
    ...(row as unknown as TravelRequestRow),
    lead: Array.isArray(lead)
      ? ((lead[0] ?? null) as RequestLead | null)
      : ((lead ?? null) as RequestLead | null),
  }
}

/**
 * Is the signed-in user a member of platform_staff?
 *
 * The user comes from `getCurrentUser()` — which the admin layout already
 * awaits — instead of a second `auth.getUser()`. Both are `cache()`d, so the
 * pair now costs one round trip to the auth server per render instead of two,
 * and every `/admin` page pays that walk before it renders anything.
 */
export const isPlatformStaff = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser()
  if (!user) return false

  const supabase = createClient()
  const { data } = await supabase
    .from("platform_staff")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()

  return Boolean(data)
})

export interface ListFilters {
  status?: RequestStatus | "todos"
  /** Matches reference, name, email, origin or destination. */
  search?: string
  limit?: number
}

export async function listTravelRequests(
  filters: ListFilters = {}
): Promise<TravelRequestRow[]> {
  const { status = "todos", search, limit = 100 } = filters
  const supabase = createClient()

  let query = supabase
    .from("trip_requests")
    .select(REQUEST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status !== "todos") {
    query = query.eq("status", status)
  }

  const term = search?.trim()
  if (term) {
    // Reference / route live on trip_requests; name and email need a separate
    // pass because PostgREST can't OR across an embedded table.
    const like = `%${term}%`
    const matchingLeads = await supabase
      .from("leads")
      .select("id")
      .or(`full_name.ilike.${like},email.ilike.${like}`)

    const leadIds = (matchingLeads.data ?? []).map((l) => l.id)
    const clauses = [
      `reference.ilike.${like}`,
      `origin.ilike.${like}`,
      `destination.ilike.${like}`,
    ]
    if (leadIds.length > 0) {
      clauses.push(`lead_id.in.(${leadIds.join(",")})`)
    }
    query = query.or(clauses.join(","))
  }

  const { data, error } = await query
  if (error) {
    console.error("[back-office] listTravelRequests failed:", error)
    return []
  }

  return (data ?? []).map((row) => normaliseRow(row as Record<string, unknown>))
}

export async function getTravelRequest(
  id: string
): Promise<TravelRequestRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("trip_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[back-office] getTravelRequest failed:", error)
    return null
  }
  return data ? normaliseRow(data as Record<string, unknown>) : null
}

export async function getRequestNotes(
  tripRequestId: string
): Promise<RequestNote[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("trip_request_notes")
    .select("id, body, author_email, created_at")
    .eq("trip_request_id", tripRequestId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[back-office] getRequestNotes failed:", error)
    return []
  }
  return data ?? []
}

export async function getRequestStats(): Promise<RequestStats> {
  const supabase = createClient()
  const { data, error } = await supabase.from("trip_requests").select("status")

  const stats = {
    total: 0,
    novo: 0,
    em_tratamento: 0,
    proposta_enviada: 0,
    fechado: 0,
    perdido: 0,
  } as RequestStats

  if (error || !data) return stats

  for (const row of data) {
    stats.total += 1
    const status = row.status as RequestStatus
    if (status in stats) stats[status] += 1
  }
  return stats
}
