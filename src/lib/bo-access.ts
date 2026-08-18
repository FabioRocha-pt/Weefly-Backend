/**
 * WeeFly — quem entra no back-office do Price Checker.
 *
 * O resto do /admin já é protegido por `isPlatformStaff()`, que responde à
 * pergunta "é da equipa?". Isto responde a uma mais estreita: "é uma das contas
 * convidadas para o Price Checker?". Duas portas e não uma porque são duas
 * decisões diferentes — dar acesso à plataforma e dar acesso a este ecrã — e
 * juntá-las obrigaria a escolher entre não deixar entrar ninguém novo na
 * plataforma ou deixar entrar todos aqui.
 *
 * A lista vive na base de dados (`bo_allowlist`, migração 0009) e não no
 * código: revogar um acesso passa a ser um update, não um deploy. A variável
 * BO_ALLOWED_EMAILS existe como rede de segurança para o caso de a tabela ainda
 * não ter sido migrada — e é ignorada quando a tabela responde.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"

/** Contas convidadas de origem. Ver `bo_allowlist` na migração 0009. */
const FALLBACK_EMAILS = ["fapi.rocha@gmail.com", "gocgo2008@gmail.com"]

function envEmails(): string[] {
  const raw = process.env.BO_ALLOWED_EMAILS
  if (!raw) return FALLBACK_EMAILS
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export interface BoIdentity {
  userId: string
  email: string
  label: string
  role: "admin" | "manager"
}

export type BoAccess =
  | { ok: true; identity: BoIdentity }
  | { ok: false; reason: "no_session" | "not_allowed"; email?: string }

/**
 * A sessão atual, se for de uma conta autorizada.
 *
 * `cache` por render: o layout, a página e cada ação chamam isto, e sem cache
 * seriam três idas ao Supabase para responder à mesma pergunta.
 */
export const getBoAccess = cache(async (): Promise<BoAccess> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return { ok: false, reason: "no_session" }
  const email = user.email.toLowerCase()

  /*
   * Lido pela service role de propósito. A política RLS de `bo_allowlist` só
   * deixa ler quem já é staff, o que faria esta verificação depender daquela —
   * e um utilizador convidado que ainda não tenha linha em `platform_staff`
   * ficaria de fora com a mensagem errada ("não é da equipa" em vez de "a sua
   * conta ainda não foi ligada").
   */
  const admin = createAdminClient()

  if (admin) {
    const { data, error } = await admin
      .from("bo_allowlist")
      .select("email, label, role, active")
      .ilike("email", email)
      .maybeSingle()

    // Erro de tabela ausente (migração 0009 não aplicada) cai no fallback.
    if (!error) {
      if (!data || !(data as { active: boolean }).active) {
        return { ok: false, reason: "not_allowed", email }
      }
      const row = data as { label: string | null; role: "admin" | "manager" }
      return {
        ok: true,
        identity: {
          userId: user.id,
          email,
          label: row.label ?? email,
          role: row.role,
        },
      }
    }
  }

  if (!envEmails().includes(email)) {
    return { ok: false, reason: "not_allowed", email }
  }

  return {
    ok: true,
    identity: { userId: user.id, email, label: email, role: "admin" },
  }
})

/**
 * Para as server actions: devolve a identidade ou null.
 *
 * Devolve null em vez de lançar porque cada ação tem uma mensagem própria para
 * dar ao ecrã, e uma exceção não atravessa a fronteira do servidor de forma
 * legível.
 */
export async function boIdentity(): Promise<BoIdentity | null> {
  const access = await getBoAccess()
  return access.ok ? access.identity : null
}

/** As iniciais que o topbar mostra no avatar. */
export function boInitials(identity: BoIdentity): string {
  const source = identity.label || identity.email
  const parts = source.split(/[\s.@]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}
