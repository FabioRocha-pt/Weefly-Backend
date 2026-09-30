"use server"

/**
 * WeeFly · MVP 2 · ADM-02 · utilizadores e permissões.
 *
 * Criar, editar, suspender e reactivar. Nunca apagar: suspender preserva o
 * histórico (a mesma regra do PAR-04).
 *
 * As escritas na allowlist vão pelo **cliente da sessão**: é o RLS da 0026
 * (`can_manage_access`) que decide se esta pessoa pode dar este perfil neste
 * parceiro, e o trigger que regista quem o fez. O que se verifica aqui antes
 * serve só para a frase de erro ser útil — tirá-lo não abria nada.
 *
 * A service role entra para o que o RLS não alcança: convidar pelo GoTrue,
 * banir e terminar as sessões de quem é suspenso.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity, type BoIdentity } from "@/lib/bo-access"
import { canGrant, profileFromRow, ACCESS_ROLE_COLUMNS, type AccessRoleRow } from "@/lib/access-roles"
import { siteUrl } from "@/lib/site-url"

export type AccessResult = { ok: true; notice?: string } | { ok: false; error: string }

const MENUS = ["flights", "cars", "houses", "experiences", "food"] as const

const userSchema = z.object({
  mode: z.enum(["create", "update"]),
  email: z.string().trim().toLowerCase().email("Email inválido."),
  label: z.string().trim().min(2, "Falta o nome.").max(120),
  roleId: z.enum(["weefly_admin", "weefly_agent", "partner_admin", "partner_agent", "secretary"]),
  partnerId: z.string().uuid("Escolha o parceiro."),
  organisationId: z.string().uuid().nullable().optional(),
  /** Nulo: os menus da empresa. */
  agentMenus: z.array(z.enum(MENUS)).nullable().optional(),
  invite: z.boolean().optional(),
})

async function manager(): Promise<BoIdentity | null> {
  const identity = await boIdentity()
  if (!identity?.profile || identity.profile.manageUsers === "none") return null
  return identity
}

function touch() {
  revalidatePath("/gestao/utilizadores")
  revalidatePath("/agente/equipa")
}

/** Uma escrita recusada pelo RLS ou pelo trigger, dita em português. */
function writeError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "Não tem permissão para dar este perfil neste parceiro."
  if (error.code === "23505") return "Já existe uma conta com este email."
  if (error.code === "23514" || error.code === "23503") {
    if (/ministério/.test(error.message)) return "Este perfil pertence a um ministério: escolha-o."
    if (/operador/.test(error.message)) return "Este perfil não existe neste parceiro."
    return "Os dados não batem certo com o perfil escolhido."
  }
  return error.message
}

export async function saveUser(input: z.input<typeof userSchema>): Promise<AccessResult> {
  const actor = await manager()
  if (!actor?.profile) return { ok: false, error: "A sua conta não gere utilizadores." }

  const parsed = userSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }
  const v = parsed.data
  const db = createClient()

  const [{ data: roleRow }, { data: partner }] = await Promise.all([
    db.from("access_roles").select(ACCESS_ROLE_COLUMNS).eq("id", v.roleId).maybeSingle(),
    db.from("partners").select("id, is_operator, status").eq("id", v.partnerId).maybeSingle(),
  ])
  const target = profileFromRow(roleRow as unknown as AccessRoleRow | null)
  if (!target || !partner) return { ok: false, error: "Parceiro ou perfil desconhecido." }

  const p = partner as { id: string; is_operator: boolean; status: string }
  if (
    !canGrant(actor.profile, target, {
      isOperator: p.is_operator,
      isOwn: p.id === actor.tenant?.partnerId,
    })
  ) {
    return {
      ok: false,
      error:
        target.id === "weefly_admin" && actor.profile.manageUsers !== "all"
          ? "Só um Admin WeeFly dá o perfil Admin WeeFly."
          : "Não pode dar este perfil neste parceiro.",
    }
  }
  if (target.needsOrganisation && !v.organisationId) {
    return { ok: false, error: "A secretária pertence a um ministério: escolha-o." }
  }

  /* Ninguém muda o próprio perfil: é a forma mais curta de uma conta se
     trancar fora, ou de se promover. */
  if (v.mode === "update" && v.email === actor.email) {
    return { ok: false, error: "O seu próprio perfil muda-o outra pessoa com acesso de gestão." }
  }

  const row = {
    email: v.email,
    label: v.label,
    role_id: v.roleId,
    partner_id: v.partnerId,
    organisation_id: target.needsOrganisation ? v.organisationId : null,
    agent_menus: v.agentMenus ?? null,
    changed_by_email: actor.email,
  }

  /* O seletor de vendedor (C-21) mostra quem cota. Um agente cota; um
     administrador e uma secretária, não. Só se decide ao criar ou ao mudar de
     perfil: editar o nome do Dominik não o pode tirar do seletor. */
  const seller = target.id === "weefly_agent" || target.id === "partner_agent" ? "manager" : "admin"

  if (v.mode === "create") {
    const { error } = await db.from("bo_allowlist").insert({ ...row, active: true, role: seller })
    if (error) return { ok: false, error: writeError(error) }
  } else {
    const { data: current } = await db
      .from("bo_allowlist")
      .select("role_id")
      .eq("email", v.email)
      .maybeSingle()
    if (!current) return { ok: false, error: "Conta não encontrada." }
    const roleChanged = (current as { role_id: string }).role_id !== v.roleId

    const { data, error } = await db
      .from("bo_allowlist")
      .update(roleChanged ? { ...row, role: seller } : row)
      .eq("email", v.email)
      .select("email")
    if (error) return { ok: false, error: writeError(error) }
    if (!data || data.length === 0) return { ok: false, error: "Conta não encontrada." }
  }

  let notice = v.mode === "create" ? "Utilizador criado." : "Utilizador actualizado."
  if (v.mode === "create" && v.invite !== false && target.backoffice) {
    const sent = await invite(v.email, v.label)
    notice += sent.ok ? " O convite foi enviado." : ` O convite não saiu: ${sent.reason}`
  }

  touch()
  return { ok: true, notice }
}

const suspendSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  reason: z.string().trim().min(3, "Escreva o motivo.").max(500),
})

/**
 * Suspender: a conta deixa de entrar e as sessões abertas terminam já.
 *
 * Três camadas, pela ordem em que actuam: `active = false` (o RLS e o
 * `getBoAccess` deixam de a reconhecer no pedido seguinte), as sessões do
 * GoTrue apagadas (o refresh deixa de funcionar), e a conta banida (não volta
 * a fazer login até ser reactivada).
 */
export async function suspendUser(input: z.input<typeof suspendSchema>): Promise<AccessResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: "A sua conta não gere utilizadores." }

  const parsed = suspendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  const v = parsed.data
  if (v.email === actor.email) return { ok: false, error: "Não pode suspender a sua própria conta." }

  const db = createClient()
  const { data, error } = await db
    .from("bo_allowlist")
    .update({
      active: false,
      suspended_by: actor.email,
      suspend_reason: v.reason,
      changed_by_email: actor.email,
    })
    .eq("email", v.email)
    .select("email")
  if (error) return { ok: false, error: writeError(error) }
  if (!data || data.length === 0) return { ok: false, error: "Conta não encontrada." }

  const cut = await cutSessions(v.email, true)
  touch()
  return {
    ok: true,
    notice: cut
      ? "Conta suspensa. As sessões abertas foram terminadas."
      : "Conta suspensa. Não havia sessão a terminar (a pessoa ainda não se registou).",
  }
}

export async function reactivateUser(email: string): Promise<AccessResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: "A sua conta não gere utilizadores." }
  const parsed = z.string().trim().toLowerCase().email().safeParse(email)
  if (!parsed.success) return { ok: false, error: "Email inválido." }

  const db = createClient()
  const { data, error } = await db
    .from("bo_allowlist")
    .update({ active: true, changed_by_email: actor.email })
    .eq("email", parsed.data)
    .select("email")
  if (error) return { ok: false, error: writeError(error) }
  if (!data || data.length === 0) return { ok: false, error: "Conta não encontrada." }

  await cutSessions(parsed.data, false)
  touch()
  return { ok: true, notice: "Conta reactivada." }
}

/** Reenviar o convite a quem ainda não entrou. */
export async function resendInvite(email: string): Promise<AccessResult> {
  const actor = await manager()
  if (!actor) return { ok: false, error: "A sua conta não gere utilizadores." }

  /* Só a quem esta pessoa vê (o RLS responde). */
  const db = createClient()
  const { data } = await db
    .from("bo_allowlist")
    .select("email, label, active")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle()
  const row = data as { email: string; label: string | null; active: boolean } | null
  if (!row) return { ok: false, error: "Conta não encontrada." }
  if (!row.active) return { ok: false, error: "A conta está suspensa." }

  const sent = await invite(row.email, row.label ?? row.email)
  return sent.ok ? { ok: true, notice: "Convite enviado." } : { ok: false, error: sent.reason }
}

// ── GoTrue ───────────────────────────────────────────────────────────────────

/**
 * O convite: cria a conta no GoTrue e manda o email (pelo hook do Resend,
 * `api/auth/send-email`). Quem já tem conta não precisa de convite — entra
 * com a password que já tem, e a allowlist já lhe dá o acesso.
 */
async function invite(
  email: string,
  label: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "servidor sem service role" }
  const base = siteUrl()
  if (!base) return { ok: false, reason: "NEXT_PUBLIC_SITE_URL por configurar" }

  const [first, ...rest] = label.trim().split(/\s+/)
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${base}/auth/callback?next=/nova-password`,
    data: { first_name: first ?? "", last_name: rest.join(" ") },
  })
  if (!error) return { ok: true }
  if (/already|registered|exists/i.test(error.message)) {
    return { ok: false, reason: "esta pessoa já tem conta — entra com a password dela." }
  }
  return { ok: false, reason: error.message }
}

/** Banir (ou levantar o banimento) e terminar as sessões. `false` se não há conta. */
async function cutSessions(email: string, suspend: boolean): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false

  const { data } = await admin
    .from("pro_accounts")
    .select("user_id")
    .eq("email", email)
    .maybeSingle()
  const userId = (data as { user_id: string } | null)?.user_id
  if (!userId) return false

  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: suspend ? "876000h" : "none",
  })
  if (banError) console.error("[gestão] banimento falhou:", banError.message)

  if (suspend) {
    const { error } = await admin.rpc("revoke_user_sessions", { p_user: userId })
    if (error) console.error("[gestão] sessões não terminadas:", error.message)
  }
  return true
}
