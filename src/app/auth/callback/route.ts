import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { safeNextPath } from "@/lib/safe-next"
import { requestOrigin } from "@/lib/request-origin"

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
 *
 * OCT-01 · o destino monta-se com o endereço do pedido (`requestOrigin`), não
 * com o `origin` do `request.url`: atrás do NGINX esse é `localhost:3000`.
 *
 * FIX-01 · o Supabase só tem uma validade para todos os links de email, e fica
 * em 24 horas por causa da confirmação do registo. O de recuperar a password
 * vale 1 hora (decisão do Ivandro): mede-se aqui, pela hora a que o email foi
 * pedido, e um link mais velho não abre o ecrã da password nova.
 */
const RECOVERY_MAX_AGE_MS = 60 * 60 * 1000

/**
 * A que horas foi pedido o email de recuperação desta conta.
 *
 * Primeiro o `recovery_sent_at` que o próprio Supabase guarda no utilizador;
 * se não vier, a última linha de recuperação em `auth_email_log`. Sem nenhum
 * dos dois não há como medir, e fica só o limite do Supabase.
 */
async function recoveryRequestedAt(user: {
  email?: string | null
  recovery_sent_at?: string | null
}): Promise<number | null> {
  const own = user.recovery_sent_at ? Date.parse(user.recovery_sent_at) : NaN
  if (Number.isFinite(own)) return own

  const admin = createAdminClient()
  if (!admin || !user.email) return null
  const { data } = await admin
    .from("auth_email_log")
    .select("created_at")
    .eq("action_type", "recovery")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const logged = data?.created_at ? Date.parse(data.created_at as string) : NaN
  return Number.isFinite(logged) ? logged : null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = requestOrigin(request.headers)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const fallback = type === "recovery" ? "/nova-password" : "/email-confirmado"
  const next = safeNextPath(searchParams.get("next")) ?? fallback

  const supabase = createClient()

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      if (type === "recovery" && data.user) {
        const requestedAt = await recoveryRequestedAt(data.user)
        if (requestedAt === null) {
          console.error("[auth/callback] recuperação sem hora de pedido: fica o limite do Supabase.")
        } else if (Date.now() - requestedAt > RECOVERY_MAX_AGE_MS) {
          /* O link já foi gasto pelo verifyOtp; fecha-se a sessão que ele abriu
             e pede-se um novo. */
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/recuperar-password?expirado=1`)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error("[auth/callback] verifyOtp falhou:", type, error.message)
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    console.error("[auth/callback] exchangeCode falhou:", error.message)
  }

  // No code, or the exchange failed (expired / already used link).
  return NextResponse.redirect(`${origin}/link-invalido`)
}
