/**
 * WeeFly Pro · a conta de quem está ligado, e o que ela pode abrir.
 *
 * PRO-02 · módulos: Fornecedor e Agente para todas as contas.
 * TEN-06 · Admin para qualquer conta com o perfil Admin WeeFly (ADM-02,
 *          migração 0026) — e não só para a do Dominik. O perfil vem da
 *          `bo_allowlist`, a mesma linha que o RLS lê.
 * PRO-03 · Fornecedor aparece sempre, com cadeado: ainda não há nada lá dentro.
 * PRO-04 · os menus do Agente vêm da empresa (`partners.agent_menus`, 0022).
 *          Qual deles já tem conteúdo é código: hoje só Passagens.
 * PRO-09 · uma conta pendente ou recusada não entra em módulo nenhum.
 *
 * Um sítio só responde a estas perguntas, para que o ecrã de escolha, os
 * layouts de cada módulo e as server actions não possam discordar. Uma página
 * escondida no menu mas aberta pelo endereço é exactamente o que o PRO-03 e o
 * PRO-04 pedem que não aconteça — por isso cada layout chama `requireModule`,
 * e não confia no menu.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"
import { redirect } from "next/navigation"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { AGENT_MENU_HREF, type AgentMenuId } from "@/lib/pro-menus"
import {
  ACCESS_ROLE_COLUMNS,
  profileFromRow,
  unwrapOne,
  type AccessProfile,
  type AccessRoleRow,
} from "@/lib/access-roles"

export type ProModule = "supplier" | "agent" | "admin"
export const PRO_MODULES: readonly ProModule[] = ["supplier", "agent", "admin"]

export type AgentMenu = AgentMenuId
export const AGENT_MENUS: readonly AgentMenu[] = [
  "flights",
  "cars",
  "houses",
  "experiences",
  "food",
]

/** Os menus que já têm conteúdo. Ligar um menu é dados; construí-lo é isto. */
const MENUS_WITH_CONTENT: readonly AgentMenu[] = ["flights"]

export type SellMode = "reseller" | "white_label"
/**
 * `suspended` não é uma coluna de `pro_accounts`: é a allowlist a dizer que a
 * conta está suspensa (ADM-02). Suspender é reversível, por isso a aprovação
 * fica onde está.
 */
export type AccountStatus = "pending" | "approved" | "rejected" | "suspended"

export interface ProPartner {
  id: string
  slug: string
  name: string
  sellMode: SellMode | null
  supplyEnabled: boolean
  sellEnabled: boolean
  agentMenus: AgentMenu[]
  isOperator: boolean
  /** TEN-05 · o interruptor do "Powered by WeeFly". */
  poweredByWeefly: boolean
}

export interface ProAccount {
  userId: string
  email: string
  status: AccountStatus
  rejectionReason: string | null
  /** TEN-06 · vê o módulo Admin. Vem do perfil; numa base sem a 0026, da
      conta master. */
  isMaster: boolean
  lastModule: ProModule | null
  partner: ProPartner | null
  /** ADM-02 · o perfil, quando a conta tem linha na allowlist. */
  profile: AccessProfile | null
  /** PRO-04 · os menus do Agente desta pessoa; nulo, os da empresa. */
  userAgentMenus: string[] | null
  /**
   * A base ainda não tem a 0022. Toda a conta entra, como antes deste
   * módulo existir, e o Admin fica só para o Dominik. Sai quando a 0022
   * estiver aplicada em todo o lado.
   */
  legacy: boolean
}

/** Transitório: só enquanto a 0022 não estiver aplicada. Ver `legacy`. */
const MASTER_FALLBACK = ["dominik@weefly.africa"]

export const PARTNER_COLUMNS =
  "id, slug, commercial_name, sell_mode, supply_enabled, sell_enabled, agent_menus, is_operator, powered_by_weefly"

export interface PartnerRow {
  id: string
  slug: string
  commercial_name: string
  sell_mode: SellMode | null
  supply_enabled: boolean
  sell_enabled: boolean
  agent_menus: string[] | null
  is_operator: boolean
  powered_by_weefly?: boolean | null
}

export function partnerFromRow(row: PartnerRow): ProPartner {
  return {
    id: row.id,
    slug: row.slug,
    name: row.commercial_name,
    sellMode: row.sell_mode,
    supplyEnabled: row.supply_enabled,
    sellEnabled: row.sell_enabled,
    agentMenus: (row.agent_menus ?? []).filter((m): m is AgentMenu =>
      (AGENT_MENUS as readonly string[]).includes(m)
    ),
    isOperator: row.is_operator,
    poweredByWeefly: row.powered_by_weefly !== false,
  }
}

interface AccountRow {
  user_id: string
  email: string
  status: AccountStatus
  rejection_reason: string | null
  is_master: boolean
  last_module: ProModule | null
  partner: PartnerRow | null
}

/** 42P01 / PGRST205: tabela inexistente. 42703: coluna. PGRST200: relação. */
export function isSchemaNotMigrated(error: { code?: string } | null | undefined): boolean {
  return ["42P01", "PGRST205", "42703", "PGRST200"].includes(error?.code ?? "")
}

/**
 * A conta da sessão. `null` quando não há sessão.
 *
 * Lê pela service role depois de a sessão dizer quem é — a mesma forma do
 * `getBoAccess`. O `user_id` vem do cookie, nunca de um parâmetro.
 */
export const getProAccount = cache(async (): Promise<ProAccount | null> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const email = (user.email ?? "").toLowerCase()
  const legacy: ProAccount = {
    userId: user.id,
    email,
    status: "approved",
    rejectionReason: null,
    isMaster: MASTER_FALLBACK.includes(email),
    lastModule: null,
    partner: null,
    profile: null,
    userAgentMenus: null,
    legacy: true,
  }

  const admin = createAdminClient()
  if (!admin) return legacy

  const { data, error } = await admin
    .from("pro_accounts")
    .select(
      `user_id, email, status, rejection_reason, is_master, last_module, partner:partners(${PARTNER_COLUMNS})`
    )
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    if (isSchemaNotMigrated(error)) return legacy
    /* Um erro a sério não pode abrir a porta: quem não se consegue ler fica
       pendente, que é o estado que não mostra nada. */
    console.error("[pro] conta ilegível", error)
    return { ...legacy, status: "pending", isMaster: false, legacy: false }
  }

  /* O trigger da 0022 cria a linha com o utilizador. Sem linha é uma conta
     criada por outro caminho, e ninguém a aprovou. */
  if (!data) {
    return { ...legacy, status: "pending", isMaster: false, legacy: false }
  }

  const row = data as unknown as AccountRow
  const access = await readAccess(admin, row.email || email)

  /* Sem a 0026 não há perfil, e o Admin continua a ser a conta master. Com
     ela, é o perfil que decide — `is_master` deixa de contar. */
  const isAdmin = access.migrated
    ? Boolean(access.profile?.adminModule)
    : row.is_master

  const status: AccountStatus =
    row.status === "approved" && access.active === false ? "suspended" : row.status

  return {
    userId: row.user_id,
    email: row.email || email,
    status,
    rejectionReason: row.rejection_reason,
    isMaster: isAdmin && status === "approved",
    lastModule: row.last_module,
    partner: row.partner ? partnerFromRow(row.partner) : null,
    profile: access.profile,
    userAgentMenus: access.agentMenus,
    legacy: false,
  }
})

interface AccessRead {
  /** A 0026 está aplicada. */
  migrated: boolean
  /** `null`: sem linha na allowlist. */
  active: boolean | null
  profile: AccessProfile | null
  agentMenus: string[] | null
}

/** A linha da allowlist desta conta: o perfil e se está activa. */
async function readAccess(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string
): Promise<AccessRead> {
  const { data, error } = await admin
    .from("bo_allowlist")
    .select(`active, agent_menus, profile:access_roles(${ACCESS_ROLE_COLUMNS})`)
    .ilike("email", email)
    .maybeSingle()

  if (error) {
    if (!isSchemaNotMigrated(error)) console.error("[pro] perfil ilegível", error)
    return { migrated: !isSchemaNotMigrated(error), active: null, profile: null, agentMenus: null }
  }
  if (!data) return { migrated: true, active: null, profile: null, agentMenus: null }

  const row = data as unknown as {
    active: boolean
    agent_menus: string[] | null
    profile: AccessRoleRow | AccessRoleRow[] | null
  }
  return {
    migrated: true,
    active: row.active,
    profile: profileFromRow(unwrapOne(row.profile)),
    agentMenus: row.agent_menus,
  }
}

// ── módulos ──────────────────────────────────────────────────────────────────

export type ModuleState = "open" | "soon" | "hidden"

/**
 * PRO-02 / PRO-03 · o que cada módulo é para esta conta.
 *
 * - Fornecedor: sempre `soon` (cadeado, Brevemente). Não abre nesta versão.
 * - Agente: aberto quando a empresa vende. Na base antiga, aberto.
 * - Admin: só a master; para as outras, não existe.
 */
export function moduleState(account: ProAccount, module: ProModule): ModuleState {
  if (account.status !== "approved") return module === "admin" ? "hidden" : "soon"
  switch (module) {
    case "supplier":
      return "soon"
    case "agent":
      /* ADM-02 · a secretária não entra no back-office: o módulo nem aparece. */
      if (account.profile && !account.profile.backoffice) return "hidden"
      if (!account.partner) return account.legacy ? "open" : "soon"
      return account.partner.sellEnabled ? "open" : "soon"
    case "admin":
      return account.isMaster ? "open" : "hidden"
  }
}

export const MODULE_HOME: Record<ProModule, string> = {
  supplier: "/empresa/dashboard",
  agent: "/agente",
  admin: "/gestao/contas",
}

/**
 * Para os layouts: a conta, se pode estar aqui. Senão redirecciona.
 *
 * Sem sessão o middleware já mandou para o login; isto só cobre o caso de a
 * sessão expirar entre o middleware e o render.
 */
export async function requireModule(module: ProModule): Promise<ProAccount> {
  const account = await getProAccount()
  if (!account) redirect("/login")
  if (account.status !== "approved") redirect("/pendente")
  if (moduleState(account, module) !== "open") redirect("/modulo")
  return account
}

/** Para as páginas que não são de módulo nenhum (escolha, perfil). */
export async function requireApprovedAccount(): Promise<ProAccount> {
  const account = await getProAccount()
  if (!account) redirect("/login")
  if (account.status !== "approved") redirect("/pendente")
  return account
}

// ── PRO-04 · menus do Agente ─────────────────────────────────────────────────

/**
 * `hidden`: desligado para esta empresa — não aparece e não abre.
 * `soon`: ligado mas ainda sem conteúdo — aparece com Brevemente.
 * `open`: ligado e com conteúdo.
 */
export function agentMenuState(account: ProAccount, menu: AgentMenu): ModuleState {
  /* ADM-02 · os menus de uma pessoa estreitam os da empresa, nunca os
     alargam: um menu desligado na empresa não se liga numa conta. */
  const own = account.userAgentMenus ? account.userAgentMenus.includes(menu) : true
  const enabled = own && (account.partner
    ? account.partner.agentMenus.includes(menu)
    : /* Base antiga: só existe a WeeFly, que vê os cinco. */ account.legacy)
  if (!enabled) return "hidden"
  return MENUS_WITH_CONTENT.includes(menu) ? "open" : "soon"
}

export function visibleAgentMenus(
  account: ProAccount
): { menu: AgentMenu; state: Exclude<ModuleState, "hidden"> }[] {
  return AGENT_MENUS.flatMap((menu) => {
    const state = agentMenuState(account, menu)
    return state === "hidden" ? [] : [{ menu, state }]
  })
}

/**
 * TEN-06 · "o login abre o Concierge por defeito".
 *
 * O Concierge é o menu Passagens do Agente. Abre-se directamente quando a
 * conta o tem aberto e entra no back-office; senão, a escolha de módulo.
 */
export function homeFor(account: ProAccount): string {
  if (account.status !== "approved") return "/pendente"
  const concierge =
    moduleState(account, "agent") === "open" &&
    agentMenuState(account, "flights") === "open" &&
    (account.profile ? account.profile.backoffice : account.legacy || Boolean(account.partner))
  return concierge ? AGENT_MENU_HREF.flights : "/modulo"
}

/** O perfil de acesso, para o PRO-13. */
export function accessProfile(account: ProAccount): "master" | "member" {
  return account.isMaster ? "master" : "member"
}
