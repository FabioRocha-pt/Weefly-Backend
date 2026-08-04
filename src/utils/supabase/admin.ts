import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client — SERVER ONLY.
 *
 * Bypasses Row Level Security entirely. It exists so the public concierge form
 * (which has no signed-in user) can insert leads without any RLS policy having
 * to grant the browser-exposed `anon` key write access to that data.
 *
 * NEVER import this from a Client Component or anything under "use client".
 * The key must not reach the browser bundle — note it is deliberately not
 * prefixed with NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch },
  })
}

/**
 * Opt every PostgREST call out of the Next.js Data Cache.
 *
 * Next patches global `fetch` in the App Router and caches GET responses, and
 * supabase-js talks to PostgREST over `fetch` — so query results get frozen and
 * replayed. It is invisible until a row changes: a client submits Link 1 and
 * still sees the blank form, because the page is reading a snapshot from before
 * the write.
 *
 * `export const dynamic = "force-dynamic"` does NOT cover this. That controls
 * how the route renders, not what the Data Cache does with a fetch inside it.
 */
function noStoreFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store" })
}
