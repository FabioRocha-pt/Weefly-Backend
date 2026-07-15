import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Route configuration.
 *
 * These map to the routes that exist in this project. If you rename the
 * dashboard/onboarding/auth routes, update the lists below.
 */
const LOGIN_ROUTE = "/login"
const DASHBOARD_HOME = "/inicio"

/** Auth pages an already-signed-in user should be bounced away from. */
const AUTH_ROUTES: readonly string[] = ["/login", "/registro"]

/** Prefixes that require a session (dashboard + onboarding areas). */
const PROTECTED_PREFIXES: readonly string[] = [
  "/inicio",
  "/empresa",
  "/agente",
  "/criar-empresa",
]

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/** Copy any cookies Supabase set during refresh onto a redirect response. */
function withRefreshedCookies(
  source: NextResponse,
  redirect: NextResponse
): NextResponse {
  source.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie)
  })
  return redirect
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not run any logic between creating the client and calling
  // getUser(). getUser() revalidates the auth token with the Supabase server.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = matchesPrefix(pathname, PROTECTED_PREFIXES)
  const isAuthRoute = AUTH_ROUTES.includes(pathname)

  // Unauthenticated user hitting a protected area → send to /login.
  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = LOGIN_ROUTE
    url.searchParams.set("redirectedFrom", pathname)
    return withRefreshedCookies(supabaseResponse, NextResponse.redirect(url))
  }

  // Authenticated user hitting /login or /registro → send to the dashboard.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = DASHBOARD_HOME
    url.search = ""
    return withRefreshedCookies(supabaseResponse, NextResponse.redirect(url))
  }

  // Return the (possibly cookie-updated) response so the session stays fresh.
  return supabaseResponse
}
