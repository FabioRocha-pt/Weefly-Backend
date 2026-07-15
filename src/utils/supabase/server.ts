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
