"use server"

/**
 * WeeFly Pro · as acções da conta: entrar num módulo (PRO-02), o perfil
 * (PRO-13) e a validação de contas pelo Dominik (PRO-09).
 *
 * Nenhuma confia no ecrã. O módulo pedido é verificado com `moduleState`, a
 * aprovação só corre para a conta master, e o utilizador vem sempre da sessão.
 */

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getI18n } from "@/i18n/server"
import { sendAccountDecisionEmail } from "@/lib/emails/account"
import { siteUrl } from "@/lib/site-url"
import {
  AGENT_MENUS,
  MODULE_HOME,
  PRO_MODULES,
  getProAccount,
  moduleState,
  type ProModule,
} from "@/lib/pro-account"

export type ProResult = { ok: true; notice?: string } | { ok: false; error: string }

// ── PRO-02 · entrar num módulo ───────────────────────────────────────────────

/**
 * Entra no módulo e lembra-o. É o único caminho do ecrã de escolha e do
 * seletor do menu lateral, para que "o último módulo usado" seja sempre
 * verdade.
 */
export async function enterModule(formData: FormData): Promise<void> {
  const module = String(formData.get("module") ?? "") as ProModule
  if (!PRO_MODULES.includes(module)) redirect("/modulo")

  const account = await getProAccount()
  if (!account) redirect("/login")
  if (account.status !== "approved") redirect("/pendente")
  if (moduleState(account, module) !== "open") redirect("/modulo")

  if (!account.legacy) {
    const admin = createAdminClient()
    await admin
      ?.from("pro_accounts")
      .update({ last_module: module })
      .eq("user_id", account.userId)
  }

  redirect(MODULE_HOME[module])
}

// ── PRO-13 · o perfil ────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40),
})

/**
 * Nome e telefone, e só isso. A empresa e o perfil de acesso são do Admin —
 * não estão no formulário e, mesmo que alguém os mande, não são lidos.
 */
export async function updateProfile(formData: FormData): Promise<ProResult> {
  const { t } = getI18n()
  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") ?? "",
  })
  if (!parsed.success) return { ok: false, error: t("profile.invalid") }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: t("errors.sessionExpiredSignIn") }

  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone,
    },
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/", "layout")
  return { ok: true, notice: t("profile.saved") }
}

// ── PRO-09 · validar contas ──────────────────────────────────────────────────

async function requireMaster() {
  const account = await getProAccount()
  if (!account || account.legacy || !account.isMaster) return null
  return account
}

const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

const approveSchema = z
  .object({
    userId: z.string().uuid(),
    /* A empresa: uma nova, ou uma que já existe (a equipa da própria WeeFly,
       ou uma segunda pessoa do Alô). */
    partnerChoice: z.enum(["new", "existing"]),
    partnerId: z.string().uuid().optional(),
    companyName: z.string().trim().max(120).optional(),
    slug: z.string().trim().toLowerCase().max(63).optional(),
    sellMode: z.enum(["reseller", "white_label"]),
    customerFront: z.enum(["own", "weefly"]),
    agentEnabled: z.boolean(),
    menus: z.array(z.enum(AGENT_MENUS as unknown as [string, ...string[]])),
  })
  .superRefine((v, ctx) => {
    if (v.partnerChoice === "existing" && !v.partnerId) {
      ctx.addIssue({ code: "custom", path: ["partnerId"], message: "partner" })
    }
    if (v.partnerChoice === "new") {
      if (!v.companyName || v.companyName.length < 2) {
        ctx.addIssue({ code: "custom", path: ["companyName"], message: "name" })
      }
      if (!v.slug || !SLUG.test(v.slug)) {
        ctx.addIssue({ code: "custom", path: ["slug"], message: "slug" })
      }
    }
  })

/** MIG-02 · do endereço configurado, nunca do `origin` do pedido. */
function loginUrl(): string {
  return `${siteUrl()}/login`
}

interface Candidate {
  user_id: string
  email: string
  status: string
}

async function readCandidate(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string
): Promise<{ account: Candidate; name: string; locale: string | null } | null> {
  const { data } = await admin
    .from("pro_accounts")
    .select("user_id, email, status")
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) return null

  const { data: found } = await admin.auth.admin.getUserById(userId)
  const meta = (found?.user?.user_metadata ?? {}) as Record<string, unknown>
  const name = [meta.first_name, meta.last_name].filter((v) => typeof v === "string" && v).join(" ")
  return {
    account: data as Candidate,
    name,
    locale: typeof meta.locale === "string" ? meta.locale : null,
  }
}

/**
 * Aprovar: escolhe-se a empresa, o tipo, o módulo e os menus.
 *
 * O módulo Fornecedor não se escolhe nesta versão — está bloqueado para todos
 * (PRO-03); o que se escolhe é se a empresa vende, que é o módulo Agente.
 */
export async function approveProAccount(input: {
  userId: string
  partnerChoice: "new" | "existing"
  partnerId?: string
  companyName?: string
  slug?: string
  sellMode: "reseller" | "white_label"
  customerFront: "own" | "weefly"
  agentEnabled: boolean
  menus: string[]
}): Promise<ProResult> {
  const master = await requireMaster()
  if (!master) return { ok: false, error: "Só a conta master valida contas." }

  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    return {
      ok: false,
      error:
        field === "slug"
          ? "O endereço da empresa só leva minúsculas, números e hífen."
          : field === "companyName"
            ? "Falta o nome da empresa."
            : field === "partnerId"
              ? "Escolha a empresa."
              : "Dados de aprovação inválidos.",
    }
  }
  const v = parsed.data

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Servidor sem service role." }

  const candidate = await readCandidate(admin, v.userId)
  if (!candidate) return { ok: false, error: "Conta não encontrada." }
  if (candidate.account.status === "approved") {
    return { ok: false, error: "Esta conta já foi aprovada." }
  }

  const partnerConfig = {
    sell_enabled: v.agentEnabled,
    sell_mode: v.sellMode,
    customer_front: v.sellMode === "white_label" ? v.customerFront : "weefly",
    agent_menus: v.menus,
  }

  let partnerId: string
  if (v.partnerChoice === "new") {
    const { data, error } = await admin
      .from("partners")
      .insert({
        slug: v.slug,
        commercial_name: v.companyName,
        contact_email: candidate.account.email,
        contact_name: candidate.name || null,
        status: "active",
        ...partnerConfig,
      })
      .select("id")
      .single()
    if (error) {
      return {
        ok: false,
        error: error.code === "23505" ? "Já existe uma empresa com esse endereço." : error.message,
      }
    }
    partnerId = (data as { id: string }).id
  } else {
    partnerId = v.partnerId!
    const { data: existing } = await admin
      .from("partners")
      .select("id, is_operator")
      .eq("id", partnerId)
      .maybeSingle()
    if (!existing) return { ok: false, error: "Empresa não encontrada." }
    /* Juntar alguém à WeeFly Global não muda a WeeFly Global: a configuração
       do operador não se edita a partir da aprovação de uma pessoa. */
    if (!(existing as { is_operator: boolean }).is_operator) {
      const { error } = await admin.from("partners").update(partnerConfig).eq("id", partnerId)
      if (error) return { ok: false, error: error.message }
    }
  }

  const decidedAt = new Date().toISOString()
  const { error: accountError } = await admin
    .from("pro_accounts")
    .update({
      status: "approved",
      partner_id: partnerId,
      rejection_reason: null,
      decided_by: master.userId,
      decided_at: decidedAt,
    })
    .eq("user_id", v.userId)
  if (accountError) return { ok: false, error: accountError.message }

  await admin.from("pro_account_decisions").insert({
    user_id: v.userId,
    decision: "approved",
    partner_id: partnerId,
    sell_mode: v.sellMode,
    supply_enabled: false,
    sell_enabled: v.agentEnabled,
    agent_menus: v.menus,
    decided_by: master.userId,
    decided_by_email: master.email,
  })

  /* Passagens é o Concierge: abre o Price Checker, cuja porta é a allowlist.
     Uma conta de outra empresa fica lá registada com o parceiro dela, e o
     `tenantMayEnter` recusa-a até as leituras do back-office respeitarem o
     parceiro (TEN-03) — criar a linha não abre nada antes do tempo. */
  if (v.agentEnabled && v.menus.includes("flights")) {
    await admin.from("bo_allowlist").upsert(
      {
        email: candidate.account.email,
        label: candidate.name || candidate.account.email,
        role: "manager",
        active: true,
        partner_id: partnerId,
        /* ADM-02 · o registo de acessos guarda quem aprovou. */
        changed_by_email: master.email,
      },
      { onConflict: "email", ignoreDuplicates: true }
    )
  }

  const sent = await sendAccountDecisionEmail({
    kind: "approved",
    to: candidate.account.email,
    name: candidate.name,
    locale: candidate.locale,
    loginUrl: loginUrl(),
  })

  revalidatePath("/gestao/contas")
  return {
    ok: true,
    notice: sent.ok
      ? "Conta aprovada. O email de aprovação foi enviado."
      : `Conta aprovada, mas o email não saiu: ${sent.reason}`,
  }
}

/** Recusar: o motivo é obrigatório, e vai no email. */
export async function rejectProAccount(input: {
  userId: string
  reason: string
}): Promise<ProResult> {
  const master = await requireMaster()
  if (!master) return { ok: false, error: "Só a conta master valida contas." }

  const reason = (input.reason ?? "").trim()
  if (!z.string().uuid().safeParse(input.userId).success) {
    return { ok: false, error: "Conta inválida." }
  }
  if (reason.length < 3) return { ok: false, error: "A recusa leva um motivo." }
  if (reason.length > 1000) return { ok: false, error: "O motivo é demasiado longo." }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: "Servidor sem service role." }

  const candidate = await readCandidate(admin, input.userId)
  if (!candidate) return { ok: false, error: "Conta não encontrada." }
  if (candidate.account.status !== "pending") {
    return { ok: false, error: "Só se recusa uma conta pendente." }
  }

  const { error } = await admin
    .from("pro_accounts")
    .update({
      status: "rejected",
      rejection_reason: reason,
      decided_by: master.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
  if (error) return { ok: false, error: error.message }

  await admin.from("pro_account_decisions").insert({
    user_id: input.userId,
    decision: "rejected",
    reason,
    decided_by: master.userId,
    decided_by_email: master.email,
  })

  const sent = await sendAccountDecisionEmail({
    kind: "rejected",
    to: candidate.account.email,
    name: candidate.name,
    locale: candidate.locale,
    reason,
  })

  revalidatePath("/gestao/contas")
  return {
    ok: true,
    notice: sent.ok
      ? "Conta recusada. O email com o motivo foi enviado."
      : `Conta recusada, mas o email não saiu: ${sent.reason}`,
  }
}
