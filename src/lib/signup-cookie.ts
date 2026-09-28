/**
 * PRO-07 · quem acabou de se registar, sem pôr o email no endereço.
 *
 * O ecrã "enviámos um email para…" precisa de saber o endereço, e o botão
 * "corrigir o email" precisa de saber **que conta** corrigir. Nenhum dos dois
 * pode vir do URL: o email ficava no histórico do browser, e um id de conta no
 * URL deixava qualquer pessoa trocar o email de um registo alheio.
 *
 * Por isso um cookie httpOnly, assinado com HMAC. A chave é a service role — o
 * único segredo do servidor que já existe em todos os ambientes. Sem assinatura
 * válida o cookie é ignorado, e o pior que se consegue é o ecrã genérico.
 *
 * SÓ SERVIDOR.
 */

import { createHmac, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"

const COOKIE = "wf_signup"
/** Um dia: o link do Supabase também expira em 24 h. */
const MAX_AGE = 60 * 60 * 24

export interface PendingSignup {
  userId: string
  email: string
}

function secret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

export function setPendingSignup(value: PendingSignup): void {
  const key = secret()
  if (!key) return
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url")
  cookies().set(COOKIE, `${payload}.${sign(payload, key)}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
  })
}

export function readPendingSignup(): PendingSignup | null {
  const key = secret()
  const raw = cookies().get(COOKIE)?.value
  if (!key || !raw) return null

  const [payload, mac] = raw.split(".")
  if (!payload || !mac) return null

  const expected = Buffer.from(sign(payload, key))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null
  }

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (typeof value?.userId === "string" && typeof value?.email === "string") {
      return { userId: value.userId, email: value.email }
    }
  } catch {
    /* cookie estragado: ignora-se */
  }
  return null
}

export function clearPendingSignup(): void {
  cookies().delete(COOKIE)
}
