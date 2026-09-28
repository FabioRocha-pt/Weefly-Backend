/**
 * WeeFly Pro · PRO-09 · o que o Admin precisa para validar contas.
 *
 * Só para a conta master: quem chama é o `/gestao/contas`, que está atrás do
 * `requireModule("admin")`. As acções voltam a verificar (`actions/pro.ts`).
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { PARTNER_COLUMNS, partnerFromRow, type PartnerRow, type ProPartner } from "@/lib/pro-account"

export interface ReviewAccount {
  userId: string
  email: string
  name: string
  phone: string | null
  country: string | null
  companyHint: string | null
  status: "pending" | "approved" | "rejected"
  partnerName: string | null
  rejectionReason: string | null
  createdAt: string
  decidedAt: string | null
  emailConfirmed: boolean
}

export interface Decision {
  id: string
  userId: string
  email: string | null
  decision: "approved" | "rejected"
  reason: string | null
  partnerName: string | null
  decidedByEmail: string | null
  createdAt: string
}

export interface AccountsReview {
  pending: ReviewAccount[]
  recent: ReviewAccount[]
  partners: ProPartner[]
  decisions: Decision[]
}

interface AccountRow {
  user_id: string
  email: string
  company_hint: string | null
  status: ReviewAccount["status"]
  rejection_reason: string | null
  created_at: string
  decided_at: string | null
  partner: { commercial_name: string } | null
}

export async function loadAccountsReview(): Promise<AccountsReview | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const [pendingRes, recentRes, partnersRes, decisionsRes] = await Promise.all([
    admin
      .from("pro_accounts")
      .select(
        "user_id, email, company_hint, status, rejection_reason, created_at, decided_at, partner:partners(commercial_name)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200),
    admin
      .from("pro_accounts")
      .select(
        "user_id, email, company_hint, status, rejection_reason, created_at, decided_at, partner:partners(commercial_name)"
      )
      .neq("status", "pending")
      .not("decided_by", "is", null)
      .order("decided_at", { ascending: false })
      .limit(30),
    admin.from("partners").select(PARTNER_COLUMNS).order("commercial_name"),
    admin
      .from("pro_account_decisions")
      .select("id, user_id, decision, reason, decided_by_email, created_at, partner:partners(commercial_name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  if (pendingRes.error || recentRes.error || partnersRes.error) {
    console.error("[pro] validação", pendingRes.error ?? recentRes.error ?? partnersRes.error)
    return null
  }

  const rows = [
    ...((pendingRes.data ?? []) as unknown as AccountRow[]),
    ...((recentRes.data ?? []) as unknown as AccountRow[]),
  ]

  /* Nome, telefone e país estão no utilizador (metadata do registo), não na
     conta. Uma leitura por conta, mas são poucas — as pendentes e as últimas
     30 decididas. */
  const users = new Map(
    await Promise.all(
      rows.map(async (r) => {
        const { data } = await admin.auth.admin.getUserById(r.user_id)
        return [r.user_id, data?.user ?? null] as const
      })
    )
  )

  const toReview = (r: AccountRow): ReviewAccount => {
    const u = users.get(r.user_id)
    const meta = (u?.user_metadata ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    return {
      userId: r.user_id,
      email: r.email,
      name: [str(meta.first_name), str(meta.last_name)].filter(Boolean).join(" ") || r.email,
      phone: str(meta.phone),
      country: str(meta.country),
      companyHint: r.company_hint,
      status: r.status,
      partnerName: r.partner?.commercial_name ?? null,
      rejectionReason: r.rejection_reason,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      emailConfirmed: Boolean(u?.email_confirmed_at),
    }
  }

  const emailById = new Map(rows.map((r) => [r.user_id, r.email]))

  return {
    pending: ((pendingRes.data ?? []) as unknown as AccountRow[]).map(toReview),
    recent: ((recentRes.data ?? []) as unknown as AccountRow[]).map(toReview),
    partners: ((partnersRes.data ?? []) as unknown as PartnerRow[]).map(partnerFromRow),
    decisions: (
      (decisionsRes.data ?? []) as unknown as {
        id: string
        user_id: string
        decision: Decision["decision"]
        reason: string | null
        decided_by_email: string | null
        created_at: string
        partner: { commercial_name: string } | null
      }[]
    ).map((d) => ({
      id: d.id,
      userId: d.user_id,
      email: emailById.get(d.user_id) ?? null,
      decision: d.decision,
      reason: d.reason,
      partnerName: d.partner?.commercial_name ?? null,
      decidedByEmail: d.decided_by_email,
      createdAt: d.created_at,
    })),
  }
}
