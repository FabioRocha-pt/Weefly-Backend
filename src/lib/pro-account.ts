/**
 * WeeFly Pro · a conta de quem está ligado, e o que ela pode abrir.
 *
 * PRO-02 · módulos: Fornecedor e Agente para todas as contas, e Admin só para
 *          a conta master.
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
import type { AgentMenuId } from "@/lib/pro-menus"

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
export type AccountStatus = "pending" | "approved" | "rejected"

export interface ProPartner {
  id: string
  slug: string
  name: string
  sellMode: SellMode | null
  supplyEnabled: boolean
  sellEnabled: boolean
  agentMenus: AgentMenu[]
  isOperator: boolean
}

export interface ProAccount {
  userId: string
  email: string
  status: AccountStatus
  rejectionReason: string | null
  isMaster: boolean
  lastModule: ProModule | null
  partner: ProPartner | null
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
  "id, slug, commercial_name, sell_mode, supply_enabled, sell_enabled, agent_menus, is_operator"

export interface PartnerRow {
  id: string
  slug: string
  commercial_name: string
  sell_mode: SellMode | null
  supply_enabled: boolean
  sell_enabled: boolean
  agent_menus: string[] | null
  is_operator: boolean
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
  return {
    userId: row.user_id,
    email: row.email || email,
    status: row.status,
    rejectionReason: row.rejection_reason,
    isMaster: row.is_master && row.status === "approved",
    lastModule: row.last_module,
    partner: row.partner ? partnerFromRow(row.partner) : null,
    legacy: false,
  }
})

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
  const enabled = account.partner
    ? account.partner.agentMenus.includes(menu)
    : /* Base antiga: só existe a WeeFly, que vê os cinco. */ account.legacy
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

/** O perfil de acesso, para o PRO-13. */
export function accessProfile(account: ProAccount): "master" | "member" {
  return account.isMaster ? "master" : "member"
}
