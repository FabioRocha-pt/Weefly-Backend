import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { createClient } from "@/utils/supabase/server"
import { safeNextPath } from "@/lib/safe-next"

/**
 * Handles the link from the confirmation / magic-link / password-reset emails.
 *
 * Two shapes arrive here:
 *
 *   · `?code=...` — the PKCE flow. It only works in the browser that started
 *     the sign-up, because the code verifier lives in that browser's cookie.
 *   · `?token_hash=...&type=signup` — PRO-08. The email template in Supabase
 *     (Auth → Email Templates) links here with `{{ .TokenHash }}`, which works
 *     on any device. Registering on the laptop and opening the email on the
 *     phone was landing on `/link-invalido`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = safeNextPath(searchParams.get("next")) ?? "/email-confirmado"

  const supabase = createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  // No code, or the exchange failed (expired / already used link).
  return NextResponse.redirect(`${origin}/link-invalido`)
}
