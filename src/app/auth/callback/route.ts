import { NextResponse } from "next/server"

import { createClient } from "@/utils/supabase/server"

/**
 * Handles the link from the confirmation / magic-link / password-reset emails.
 * Supabase appends a `?code=...`; we exchange it for a session cookie, then
 * redirect to the success page (or the invalid-link page on failure).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/email-confirmado"

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // No code, or the exchange failed (expired / already used link).
  return NextResponse.redirect(`${origin}/link-invalido`)
}
