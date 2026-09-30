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
 * deixa ver tudo. Ver todos os parceiros é o espaço B2G do Admin (ADM-08), só
 * de leitura. É isto que faz o A7 passar nas contas da WeeFly.
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
  /** O parceiro cujo trabalho se mostra. Nulo só na base sem a 0020. */
  partnerId: string | null
}

export const getBoScope = cache(async (): Promise<BoScope | null> => {
  const identity = await boIdentity()
  if (!identity) return null

  if (identity.tenant) {
    return {
      identity,
      db: createClient() as unknown as SupabaseClient,
      partnerId: identity.tenant.partnerId,
    }
  }

  const admin = createAdminClient()
  if (!admin) return null
  return { identity, db: admin as unknown as SupabaseClient, partnerId: null }
})

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

  let query = scope.db.from("booking_cases").select("id").eq("id", caseId)
  if (scope.partnerId) query = query.eq("partner_id", scope.partnerId)

  const { data, error } = await query.maybeSingle()
  if (error) {
    console.error("[bo/scope] caso ilegível:", error.message)
    return false
  }
  return Boolean(data)
})

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
