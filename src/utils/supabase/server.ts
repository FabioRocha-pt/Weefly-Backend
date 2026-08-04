import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * `cookies()` is synchronous on Next.js 14. (On Next.js 15 make this function
 * `async` and `await cookies()`.)
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      /*
       * Never let the Next.js Data Cache hold a PostgREST response. See the
       * long note in utils/supabase/admin.ts — supabase-js goes through the
       * patched global `fetch`, so without this the back-office happily shows
       * a stale copy of the case list after every write.
       */
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // `setAll` was called from a Server Component, where cookies are
            // read-only. Safe to ignore — the middleware refreshes the session
            // on every request, so tokens stay current.
          }
        },
      },
    }
  )
}
