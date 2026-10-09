/**
 * WeeFly · MVP 2 · TEN-03 · a fronteira entre parceiros, no back-office.
 *
 * O back-office lia tudo pela service role, que ignora o RLS. As políticas da
 * 0020 estavam lá e não serviam de nada: uma conta do Alô abria a fila e via a
 * WeeFly. Era por isso que `tenantMayEnter` recusava todas as contas que não
 * fossem do operador.
 *
 * Duas regras, e é tudo o que este ficheiro faz:
 *
 *   1. **As listas leem pelo cliente da sessão** (`scope.db`), com o RLS a
 *      decidir. Fila, pesquisa, campainha, clientes, exportação.
 *
 *   2. **Um caso só se abre depois de o RLS dizer que a sessão o vê**
 *      (`caseInScope`). As escritas continuam pela service role — o Storage,
 *      o GoTrue e os registos precisam dela — mas nenhuma corre sem esta
 *      pergunta antes. Um caso de outro parceiro dá "não encontrado", e não
 *      "proibido": o 404 do TEN-03.
 *
 * Por cima do RLS, a área de trabalho: o concierge de um parceiro mostra os
 * casos desse parceiro, e só esses — também a um Admin WeeFly, que o RLS
 * deixa ver tudo. É isto que faz o A7 passar nas contas da WeeFly.
 *
 * B2G-14 · D-12 · o master trabalha sem empresa: `getBoScope({ workspace:
 * "all" })` dá-lhe todas (o concierge do master, `/gestao/concierge`), e a
 * ficha de um caso de qualquer empresa abre-se-lhe (decisão 2: reclamar é a
 * intervenção registada). Uma conta de parceiro que peça "all" recebe o seu
 * parceiro, e o RLS repete a fronteira por baixo.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity, type BoIdentity } from "@/lib/bo-access"

export interface BoScope {
  identity: BoIdentity
  /**
   * Para as leituras do back-office. O cliente da sessão, com o RLS. A
   * service role só numa base sem a 0020, onde só existe um parceiro e não há
   * fronteira nenhuma a guardar.
   */
  db: SupabaseClient
  /**
   * O parceiro cujo trabalho se mostra. Nulo na base sem a 0020 e, para o
   * master, na área de trabalho "todas as empresas" (D-12): aí é o RLS que
   * decide, e o RLS deixa-o ver todas.
   */
  partnerId: string | null
}

/**
 * B2G-14 · D-12 · a área de trabalho.
 *
 *   · `own` (por omissão) — o parceiro da conta, como sempre;
 *   · `all` — todas as empresas. **Só** para uma conta que vê todos os
 *     parceiros (`cross_partner`, o master). Pedida por outra conta, é
 *     ignorada: volta o parceiro dela. Nunca vem do browser sem passar aqui.
 */
export type BoWorkspace = "own" | "all"

/**
 * A conta vê todas as empresas? As duas respostas têm de concordar: a da
 * allowlist (`cross_partner`, só no operador — é a que o RLS lê) e a do
 * perfil (Admin WeeFly). Uma só não chega.
 */
export function isCrossPartner(identity: BoIdentity | null | undefined): boolean {
  return Boolean(identity?.tenant?.crossPartner && identity.profile?.crossPartner)
}

/* `cache` por argumento primitivo: `getBoScope({ workspace })` com um objecto
   novo a cada chamada nunca acertava na cache do React. */
const scopeFor = cache(async (workspace: BoWorkspace): Promise<BoScope | null> => {
  const identity = await boIdentity()
  if (!identity) return null

  if (identity.tenant) {
    const all = workspace === "all" && isCrossPartner(identity)
    return {
      identity,
      db: createClient() as unknown as SupabaseClient,
      partnerId: all ? null : identity.tenant.partnerId,
    }
  }

  const admin = createAdminClient()
  if (!admin) return null
  return { identity, db: admin as unknown as SupabaseClient, partnerId: null }
})

export async function getBoScope(options: { workspace?: BoWorkspace } = {}): Promise<BoScope | null> {
  return scopeFor(options.workspace === "all" ? "all" : "own")
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O RLS deixa esta sessão ver o caso, e o caso é do parceiro dela?
 *
 * `cache` por pedido: a página e as acções que ela chama perguntam pelo mesmo
 * caso, e a resposta não muda a meio de um render.
 */
export const caseInScope = cache(async (caseId: string): Promise<boolean> => {
  if (!UUID.test(caseId)) return false
  const scope = await getBoScope()
  if (!scope) return false

  /* D-12 · decisão 2 · o master trata casos de qualquer empresa: para ele
     chega o RLS (que lhe mostra todas). Reclamar é a intervenção registada
     (`claim_case`); cada acção continua no registo do caso. */
  const master = isCrossPartner(scope.identity)
  let query = scope.db.from("booking_cases").select("id").eq("id", caseId)
  if (scope.partnerId && !master) query = query.eq("partner_id", scope.partnerId)

  const { data, error } = await query.maybeSingle()
  if (error) {
    console.error("[bo/scope] caso ilegível:", error.message)
    return false
  }
  if (data) return true

  /* ADM-04 · o caso de outro parceiro abre-se ao Admin WeeFly durante uma
     intervenção explícita e registada (continua a valer, só de leitura). */
  return Boolean(scope.partnerId && (await liveIntervention(caseId)))
})

export interface LiveIntervention {
  id: string
  partnerId: string
  reason: string
  expiresAt: string
}

/**
 * ADM-04 · "Só leitura por defeito. Intervir exige uma ação explícita, que
 * fica registada." A intervenção em curso desta sessão neste caso, se houver.
 * Só o Admin WeeFly (o RLS da 0030 não mostra a tabela a mais ninguém).
 */
export const liveIntervention = cache(async (caseId: string): Promise<LiveIntervention | null> => {
  if (!UUID.test(caseId)) return null
  const scope = await getBoScope()
  if (!scope?.identity.profile?.crossPartner) return null
  const { data, error } = await scope.db
    .from("admin_interventions")
    .select("id, partner_id, reason, expires_at")
    .eq("case_id", caseId)
    .eq("user_id", scope.identity.userId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const r = data as { id: string; partner_id: string; reason: string; expires_at: string }
  return { id: r.id, partnerId: r.partner_id, reason: r.reason, expiresAt: r.expires_at }
})

/**
 * O âmbito com que se lê a ficha de um caso: o da sessão, ou — durante uma
 * intervenção — o do parceiro do caso, para que a fila e a ficha o encontrem.
 */
export async function scopeForCase(caseId: string): Promise<BoScope | null> {
  const scope = await getBoScope()
  if (!scope) return null
  /* D-12 · o master lê a ficha de qualquer empresa sem filtro de parceiro
     (o RLS decide). Só depois de `caseInScope` — quem chama já perguntou. */
  if (isCrossPartner(scope.identity)) return { ...scope, partnerId: null }
  const intervention = await liveIntervention(caseId)
  return intervention ? { ...scope, partnerId: intervention.partnerId } : scope
}

/**
 * Para as server actions sobre um caso: a identidade, se o caso estiver na
 * área dela. Senão `null` — a mesma resposta que uma sessão sem acesso, para
 * que um id de outro parceiro não confirme que existe.
 */
export async function boCaseIdentity(caseId: string): Promise<BoIdentity | null> {
  const identity = await boIdentity()
  if (!identity) return null
  return (await caseInScope(caseId)) ? identity : null
}

/**
 * O caso a que pertence uma linha filha (pagamento, comprovativo, oferta…),
 * lida pela service role — só para depois perguntar `caseInScope`. Nunca
 * devolve dados da linha.
 */
export async function caseIdOf(
  table: "case_payments" | "case_payment_proofs" | "case_proposals" | "case_passengers",
  id: string
): Promise<string | null> {
  if (!UUID.test(id)) return null
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin.from(table).select("case_id").eq("id", id).maybeSingle()
  return (data as { case_id: string } | null)?.case_id ?? null
}

/** Como `boCaseIdentity`, e o pagamento tem de ser deste caso. */
export async function boPaymentIdentity(
  caseId: string,
  paymentId: string
): Promise<BoIdentity | null> {
  const identity = await boCaseIdentity(caseId)
  if (!identity) return null
  return (await caseIdOf("case_payments", paymentId)) === caseId ? identity : null
}
