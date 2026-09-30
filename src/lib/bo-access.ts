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
import {
  ALLOWLIST_TENANT_COLUMNS,
  tenantFromRow,
  tenantMayEnter,
  type AllowlistTenantRow,
  type Tenant,
} from "@/lib/tenancy"
import {
  ACCESS_ROLE_COLUMNS,
  profileFromRow,
  unwrapOne,
  type AccessProfile,
  type AccessRoleRow,
} from "@/lib/access-roles"

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
  /**
   * O poder sobre os casos: `admin` reabre casos fechados, revoga links e
   * publica propostas alheias — dentro do seu parceiro. Vem do perfil
   * (`supervises_cases`), não da coluna `role`, que desde a 0026 só diz quem
   * aparece no seletor de vendedor.
   */
  role: "admin" | "manager"
  /**
   * O parceiro da conta (TEN-06). Nulo só numa base sem a migração 0020, onde
   * o único parceiro que existe é o operador.
   */
  tenant: Tenant | null
  /**
   * ADM-02 · o perfil. Numa base sem a 0026, deduzido como a 0026 o deduz
   * (quem vê todos os parceiros é Admin WeeFly).
   */
  profile: AccessProfile | null
  /** O ministério, para o perfil Secretária. */
  organisationId: string | null
  /** PRO-04 · os menus do Agente desta pessoa; nulo, os da empresa. */
  agentMenus: string[] | null
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
    const { data, error } = await readAllowlistRow(admin, email)

    /* Um erro a sério fecha a porta. Cair na lista do ambiente deixava entrar
       sem parceiro — e sem parceiro o `getBoScope` lê pela service role, sem
       fronteira nenhuma (TEN-03). Os erros de "ainda não existe" já foram
       tratados em `readAllowlistRow`. */
    if (error) {
      console.error(`[bo] allowlist ilegível para ${email}:`, error)
      return { ok: false, reason: "not_allowed", email }
    }

    {
      if (!data || !data.active) {
        return { ok: false, reason: "not_allowed", email }
      }

      const tenant = data.tenant
      if (tenant) {
        const gate = tenantMayEnter(tenant)
        if (!gate.ok) {
          console.warn(`[bo] ${email} recusado: ${gate.why}`)
          return { ok: false, reason: "not_allowed", email }
        }
      }

      /* ADM-02 · a secretária tem linha na allowlist e não entra no
         back-office: só no link do ministério. */
      if (data.profile && !data.profile.backoffice) {
        return { ok: false, reason: "not_allowed", email }
      }

      return {
        ok: true,
        identity: {
          userId: user.id,
          email,
          label: data.label ?? email,
          role: data.profile ? (data.profile.supervisesCases ? "admin" : "manager") : data.role,
          tenant,
          profile: data.profile,
          organisationId: data.organisationId,
          agentMenus: data.agentMenus,
        },
      }
    }
  }

  if (!envEmails().includes(email)) {
    return { ok: false, reason: "not_allowed", email }
  }

  return {
    ok: true,
    identity: {
      userId: user.id,
      email,
      label: email,
      role: "admin",
      tenant: null,
      profile: null,
      organisationId: null,
      agentMenus: null,
    },
  }
})

interface AllowlistRow {
  label: string | null
  role: "admin" | "manager"
  active: boolean
  tenant: Tenant | null
  profile: AccessProfile | null
  organisationId: string | null
  agentMenus: string[] | null
}

type RawRow = AllowlistTenantRow & {
  label: string | null
  role: "admin" | "manager"
  active: boolean
  organisation_id?: string | null
  agent_menus?: string[] | null
  profile?: AccessRoleRow | AccessRoleRow[] | null
}

/**
 * A linha da allowlist, com o parceiro (0020) e o perfil (0026).
 *
 * Três leituras em escada e não uma porque o `main` e o `mvp2` partilham a
 * mesma base: pedir uma coluna que uma migração ainda não criou dá erro, e
 * esse erro não pode trancar a equipa fora. Cada degrau só desce no erro de
 * "ainda não existe"; qualquer outro é devolvido como erro.
 */
async function readAllowlistRow(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string
): Promise<{ data: AllowlistRow | null; error: unknown }> {
  const read = (columns: string) =>
    admin.from("bo_allowlist").select(columns).ilike("email", email).maybeSingle()

  const steps = [
    `label, role, active, organisation_id, agent_menus, ${ALLOWLIST_TENANT_COLUMNS}, profile:access_roles(${ACCESS_ROLE_COLUMNS})`,
    `label, role, active, ${ALLOWLIST_TENANT_COLUMNS}`,
    "label, role, active",
  ]

  for (const columns of steps) {
    const res = await read(columns)
    if (res.error) {
      if (isSchemaNotMigrated(res.error)) continue
      return { data: null, error: res.error }
    }
    if (!res.data) return { data: null, error: null }

    const row = res.data as unknown as RawRow
    const tenant = row.partner ? tenantFromRow(row) : null
    return {
      data: {
        label: row.label,
        role: row.role,
        active: row.active,
        tenant,
        profile: profileFromRow(unwrapOne(row.profile)) ?? legacyProfile(tenant),
        organisationId: row.organisation_id ?? null,
        agentMenus: row.agent_menus ?? null,
      },
      error: null,
    }
  }

  return { data: null, error: null }
}

/**
 * Numa base sem a 0026: o perfil que a 0026 lhe daria. Sem parceiro (base sem
 * a 0020), nenhum — e o código segue o `role` antigo.
 */
function legacyProfile(tenant: Tenant | null): AccessProfile | null {
  if (!tenant) return null
  const base = {
    backoffice: true,
    grantableByPartner: false,
    needsOrganisation: false,
  }
  if (tenant.crossPartner) {
    return {
      ...base,
      id: "weefly_admin",
      labelPt: "Admin WeeFly",
      labelEn: "WeeFly admin",
      partnerKind: "operator",
      adminModule: true,
      crossPartner: true,
      manageUsers: "all",
      supervisesCases: true,
      sort: 1,
    }
  }
  return {
    ...base,
    id: tenant.isOperator ? "weefly_agent" : "partner_agent",
    labelPt: tenant.isOperator ? "Agente WeeFly" : "Agente do parceiro",
    labelEn: tenant.isOperator ? "WeeFly agent" : "Partner agent",
    partnerKind: tenant.isOperator ? "operator" : "partner",
    adminModule: false,
    crossPartner: false,
    manageUsers: "none",
    supervisesCases: false,
    sort: tenant.isOperator ? 2 : 4,
  }
}

/** 42703: coluna inexistente. PGRST200: relação desconhecida. */
function isSchemaNotMigrated(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST200"
}

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

export interface BoSeller {
  email: string
  label: string
  role: "admin" | "manager"
}

/**
 * BO-14 · os vendedores, lidos de quem existe no sistema.
 *
 * "O seletor de vendedor lê dos utilizadores que existem no sistema, nunca de
 * uma lista escrita no código. Acrescentar um utilizador faz com que ele
 * apareça sem um deploy."
 *
 * A lista é a `bo_allowlist` e não `auth.users`, e a diferença é deliberada:
 * a allowlist é quem tem direito a estar aqui, escrita antes de a conta existir.
 * Um vendedor a quem se atribui um caso na segunda-feira pode só fazer o
 * primeiro login na quarta, e o caso não pode ficar sem dono por causa disso.
 *
 * Hoje devolve duas contas de administração e o Dominik (migração 0013). A
 * gestão de perfis e permissões é do Sprint 3 — até lá, o que separa um
 * vendedor de um administrador é a coluna `role`, e mais nada.
 */
export async function listBoSellers(): Promise<BoSeller[]> {
  const admin = createAdminClient()
  if (!admin) return []

  /*
   * C-21 · o seletor tem uma entrada: Dominik.
   *
   * A lista continua a ser lida da base de dados — acrescentar um vendedor
   * continua a ser um insert e não um deploy, que é o resto do critério. O que
   * se acrescenta é o filtro por `role`: as duas contas de administração são a
   * única porta de entrada neste back-office, e por isso **não** podem ser
   * desactivadas para cumprir "uma entrada" — desactivá-las trancava a equipa
   * fora. Deixam de ser atribuíveis como vendedor, que é a pergunta que este
   * seletor faz, e continuam a entrar.
   *
   * Um caso já atribuído a uma delas continua a mostrá-la: ver o `option` de
   * recurso em `case-header.tsx`, que existe precisamente para não reescrever
   * o histórico.
   */
  /*
   * TEN-03 · os vendedores do parceiro de quem pergunta, e só esses: o
   * seletor de um agente do Alô não mostra a equipa da WeeFly. E a secretária
   * (ADM-02) não é vendedora — tem linha na allowlist, mas não cota.
   */
  const identity = await boIdentity()
  if (!identity) return []

  const query = (withProfile: boolean) => {
    let q = admin
      .from("bo_allowlist")
      .select("email, label, role")
      .eq("active", true)
      .eq("role", "manager")
      .order("label", { ascending: true, nullsFirst: false })
    if (identity.tenant) q = q.eq("partner_id", identity.tenant.partnerId)
    if (withProfile) q = q.neq("role_id", "secretary")
    return q
  }

  let { data, error } = await query(true)
  if (error && isSchemaNotMigrated(error)) ({ data, error } = await query(false))

  if (error) {
    console.error("[bo] lista de vendedores falhou:", error.message)
    return []
  }

  return (data ?? []).map((row) => {
    const entry = row as { email: string; label: string | null; role: "admin" | "manager" }
    return {
      email: entry.email,
      label: entry.label ?? entry.email,
      role: entry.role,
    }
  })
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
